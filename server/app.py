#!/usr/bin/env python3
"""API SQLite para ejecutarse en localhost detrás de un proxy HTTPS."""

import argparse
from dataclasses import dataclass
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import re
import socket
import sqlite3
import sys
import threading
from urllib.parse import parse_qs, urlsplit
import uuid

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from server.database import assert_ready, canonical, connect, public_actor, token_hash, utc_now


RESULT_COLUMNS = ("id", "test_id", "status", "answers_data", "total_questions",
                  "total_correct", "score_percentage", "revision", "created_at", "updated_at")


class APIError(Exception):
    def __init__(self, status, code, message, current=None):
        super().__init__(message)
        self.status = status
        self.payload = {"error": code, "message": message}
        if current is not None:
            self.payload["current"] = current


@dataclass(frozen=True)
class Config:
    database: Path
    allowed_origins: tuple = ()
    busy_timeout: float = 2.0
    max_body_bytes: int = 262144
    socket_timeout: float = 10.0
    max_connections: int = 32
    access_mode: str = "token"

    def __post_init__(self):
        if self.access_mode not in ("token", "public"):
            raise ValueError("access_mode debe ser token o public")


def result_json(row):
    result = {column: row[column] for column in RESULT_COLUMNS}
    result["answers_data"] = json.loads(result["answers_data"])
    return result


def integer(value, field, minimum=0):
    if type(value) is not int or value < minimum or value > 9223372036854775807:
        raise APIError(400, "invalid_payload", f"{field} debe ser un entero válido")
    return value


def unique_object(pairs):
    output = {}
    for key, value in pairs:
        if key in output:
            raise ValueError("Clave JSON repetida")
        output[key] = value
    return output


def invalid_constant(value):
    raise ValueError("Número JSON no válido")


class APIServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 16

    def __init__(self, address, config):
        self.config = config
        connection = connect(config.database, config.busy_timeout)
        try:
            assert_ready(connection)
            self.public_actor_id = public_actor(connection) if config.access_mode == "public" else None
        finally:
            connection.close()
        self.slots = threading.BoundedSemaphore(config.max_connections)
        super().__init__(address, Handler)

    def get_request(self):
        request, address = super().get_request()
        request.settimeout(self.config.socket_timeout)
        return request, address

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            try:
                request.sendall(b"HTTP/1.0 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
            except OSError:
                pass
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


class Handler(BaseHTTPRequestHandler):
    server_version = "TestsAPI"
    sys_version = ""
    protocol_version = "HTTP/1.0"

    def log_message(self, format_string, *args):
        # No URLs, cuerpos ni cabeceras/token en los logs de acceso.
        pass

    def respond(self, status, payload=None):
        body = b"" if payload is None else canonical(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Vary", "Origin")
        origin = self.headers.get("Origin")
        if origin in self.server.config.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
        if status == 401:
            self.send_header("WWW-Authenticate", 'Bearer realm="Tests Ayuntamiento"')
        if status == 503:
            self.send_header("Retry-After", "1")
        if self.command == "OPTIONS" and status == 204:
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def check_origin(self):
        origin = self.headers.get("Origin")
        if origin is not None and origin not in self.server.config.allowed_origins:
            raise APIError(403, "origin_not_allowed", "Origen no permitido")

    def authenticate(self, connection):
        if self.server.config.access_mode == "public":
            return self.server.public_actor_id
        headers = self.headers.get_all("Authorization", [])
        if len(headers) != 1 or not headers[0].startswith("Bearer "):
            raise APIError(401, "unauthorized", "Introduce el acceso de este dispositivo")
        token = headers[0][7:]
        if not 40 <= len(token) <= 256 or not re.fullmatch(r"[A-Za-z0-9_-]+", token):
            raise APIError(401, "unauthorized", "Acceso no válido")
        device = connection.execute(
            "SELECT id FROM devices WHERE token_hash = ? AND revoked_at IS NULL",
            (token_hash(token),)).fetchone()
        if device is None:
            raise APIError(401, "unauthorized", "Acceso no válido o revocado")
        return device[0]

    def read_body(self):
        if self.headers.get("Transfer-Encoding"):
            raise APIError(400, "invalid_payload", "Codificación de cuerpo no admitida")
        lengths = self.headers.get_all("Content-Length", [])
        if len(lengths) != 1 or not re.fullmatch(r"[0-9]+", lengths[0]):
            raise APIError(400, "invalid_payload", "Falta una longitud de cuerpo válida")
        length = int(lengths[0])
        if length > self.server.config.max_body_bytes:
            raise APIError(413, "body_too_large", "Las respuestas superan el tamaño permitido")
        if self.headers.get_content_type() != "application/json":
            raise APIError(400, "invalid_payload", "El cuerpo debe ser JSON")
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise APIError(400, "invalid_payload", "Cuerpo incompleto")
        try:
            body = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object,
                              parse_constant=invalid_constant)
            # Rechaza también números que desborden a infinito al decodificarlos.
            canonical(body).encode("utf-8")
        except (ValueError, UnicodeError, RecursionError):
            raise APIError(400, "invalid_payload", "JSON no válido") from None
        if not isinstance(body, dict):
            raise APIError(400, "invalid_payload", "El cuerpo debe ser un objeto")
        return body

    def route(self):
        parsed = urlsplit(self.path)
        if parsed.scheme or parsed.netloc or parsed.fragment:
            raise APIError(400, "invalid_route", "Ruta no válida")
        try:
            query = parse_qs(parsed.query, keep_blank_values=True, max_num_fields=4)
        except ValueError:
            raise APIError(400, "invalid_query", "Consulta no válida") from None
        for values in query.values():
            if len(values) != 1:
                raise APIError(400, "invalid_query", "Parámetro repetido")
        return parsed.path, query

    def query_integer(self, query, name, minimum=1, default=None):
        if name not in query:
            return default
        value = query[name][0]
        if not re.fullmatch(r"[0-9]{1,19}", value):
            raise APIError(400, "invalid_query", f"{name} no válido")
        return integer(int(value), name, minimum)

    def fetch_result(self, connection, result_id):
        row = connection.execute("SELECT * FROM results WHERE id = ?", (result_id,)).fetchone()
        if row is None:
            raise APIError(404, "not_found", "Resultado inexistente")
        if row["deleted_at"] is not None:
            raise APIError(410, "deleted", "Este resultado fue eliminado en otro dispositivo")
        return row

    def get(self, connection, path, query):
        if path == "/api/tests" and not query:
            return [dict(row) for row in connection.execute("SELECT id, titulo, fichero, num_preguntas FROM tests ORDER BY id")]
        if path in ("/api/progress", "/api/history"):
            allowed = {"test_id"} if path == "/api/progress" else {"test_id", "limit"}
            if set(query) - allowed:
                raise APIError(400, "invalid_query", "Parámetro no admitido")
            test_id = self.query_integer(query, "test_id")
            conditions = ["deleted_at IS NULL"]
            values = []
            if test_id is not None:
                conditions.append("test_id = ?")
                values.append(test_id)
            if path == "/api/history":
                conditions.append("status = 'completed'")
                limit = self.query_integer(query, "limit", default=10)
                if limit > 100:
                    raise APIError(400, "invalid_query", "limit no puede superar 100")
            else:
                conditions.append("status = 'in_progress'")
                limit = None
            sql = "SELECT * FROM results WHERE " + " AND ".join(conditions) + " ORDER BY id DESC"
            if limit is not None:
                sql += " LIMIT ?"
                values.append(limit)
            return [result_json(row) for row in connection.execute(sql, values)]
        match = re.fullmatch(r"/api/progress/([0-9]{1,19})", path)
        if match and not query:
            return result_json(self.fetch_result(connection, integer(int(match[1]), "id", 1)))
        raise APIError(404, "not_found", "Ruta inexistente")

    def validate_mutation(self, method, body):
        allowed = {"operation_id", "revision"} if method == "DELETE" else {
            "operation_id", "answers_data", "total_questions", "total_correct", "score_percentage"}
        allowed.add("test_id" if method == "POST" else "revision")
        if set(body) - allowed:
            raise APIError(400, "invalid_payload", "Campo no admitido")
        operation_id = body.get("operation_id")
        try:
            if not isinstance(operation_id, str) or str(uuid.UUID(operation_id)) != operation_id:
                raise ValueError()
        except (ValueError, AttributeError):
            raise APIError(400, "invalid_payload", "operation_id debe ser un UUID canónico") from None
        if method == "POST":
            integer(body.get("test_id"), "test_id", 1)
            integer(body.get("total_questions"), "total_questions")
        else:
            integer(body.get("revision"), "revision", 1)
        if method != "DELETE":
            if not isinstance(body.get("answers_data"), list) or len(body["answers_data"]) > 10000:
                raise APIError(400, "invalid_payload", "answers_data debe ser un array de respuestas")
            for field in ("total_correct", "total_questions"):
                if field in body and body[field] is not None:
                    integer(body[field], field)
            if "total_questions" in body and body["total_questions"] is None:
                raise APIError(400, "invalid_payload", "total_questions no puede ser null")
            score = body.get("score_percentage")
            if score is not None and (type(score) not in (int, float) or not 0 <= score <= 100 or not math.isfinite(score)):
                raise APIError(400, "invalid_payload", "score_percentage debe estar entre 0 y 100")
        return operation_id

    def mutate(self, connection, device_id, path, query):
        method = self.command
        match = re.fullmatch(r"/api/progress/([0-9]{1,19})", path)
        if query or (method == "POST" and path != "/api/progress") or (method != "POST" and not match):
            raise APIError(404, "not_found", "Ruta inexistente")
        result_id = integer(int(match[1]), "id", 1) if match else None
        body = self.read_body()
        operation_id = self.validate_mutation(method, body)
        def fingerprint_for(actor):
            return hashlib.sha256(canonical({"device": actor, "method": method,
                                             "path": path, "body": body}).encode("utf-8")).hexdigest()

        fingerprint = fingerprint_for(device_id)
        connection.execute("BEGIN IMMEDIATE")
        try:
            # Una revocación que ganó el bloqueo invalida también esta escritura.
            self.authenticate(connection)
            previous = connection.execute("SELECT * FROM operations WHERE operation_id = ?", (operation_id,)).fetchone()
            if previous is not None:
                # Tras abrir el acceso, recuperar también un ACK perdido del modo anterior.
                owner = previous["device_id"] if self.server.config.access_mode == "public" else device_id
                if previous["device_id"] != owner or previous["fingerprint"] != fingerprint_for(owner):
                    raise APIError(409, "operation_conflict", "El identificador ya se usó para otra operación")
                connection.commit()
                return previous["response_status"], json.loads(previous["response_json"])
            now = utc_now()
            if method == "POST":
                if connection.execute("SELECT id FROM tests WHERE id = ?", (body["test_id"],)).fetchone() is None:
                    raise APIError(404, "not_found", "Tema inexistente")
                current = connection.execute(
                    "SELECT * FROM results WHERE test_id = ? AND status = 'in_progress' AND deleted_at IS NULL ORDER BY id DESC LIMIT 1",
                    (body["test_id"],)).fetchone()
                if current is not None:
                    raise APIError(409, "active_attempt", "Este tema ya tiene un intento activo", result_json(current))
                values = {"test_id": body["test_id"], "status": "in_progress", "answers_data": canonical(body["answers_data"]),
                          "total_questions": body["total_questions"], "total_correct": body.get("total_correct"),
                          "score_percentage": body.get("score_percentage"), "revision": 1, "created_at": now, "updated_at": now}
                self.check_scores(values)
                cursor = connection.execute(
                    "INSERT INTO results(" + ",".join(values) + ") VALUES (" + ",".join("?" for _ in values) + ")",
                    list(values.values()))
                result_id = cursor.lastrowid
                status = 201
            else:
                current = self.fetch_result(connection, result_id)
                if current["revision"] != body["revision"]:
                    raise APIError(409, "revision_conflict", "Este test cambió en otro dispositivo", result_json(current))
                if method == "DELETE":
                    cursor = connection.execute("UPDATE results SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?",
                                                (now, now, result_id, body["revision"]))
                else:
                    values = {"answers_data": canonical(body["answers_data"]), "updated_at": now}
                    for field in ("total_questions", "total_correct", "score_percentage"):
                        if field in body:
                            values[field] = body[field]
                    merged = dict(current)
                    merged.update(values)
                    self.check_scores(merged)
                    cursor = connection.execute("UPDATE results SET " + ",".join(f"{column} = ?" for column in values) +
                                                ", revision = revision + 1 WHERE id = ? AND revision = ?",
                                                [*values.values(), result_id, body["revision"]])
                if cursor.rowcount != 1:
                    raise APIError(409, "revision_conflict", "No se pudo aplicar la revisión original", result_json(current))
                status = 200
            response = {"deleted": True, "id": result_id} if method == "DELETE" else result_json(self.fetch_result(connection, result_id))
            connection.execute("INSERT INTO operations VALUES (?, ?, ?, ?, ?, ?)",
                               (operation_id, device_id, fingerprint, status, canonical(response), now))
            connection.commit()
            return status, response
        except Exception:
            connection.rollback()
            raise

    def check_scores(self, values):
        correct, total = values.get("total_correct"), values.get("total_questions")
        if correct is not None and total is not None and correct > total:
            raise APIError(400, "invalid_payload", "total_correct supera total_questions")

    def dispatch(self):
        connection = None
        try:
            self.check_origin()
            path, query = self.route()
            if self.command == "OPTIONS":
                if self.headers.get("Origin") not in self.server.config.allowed_origins:
                    raise APIError(403, "origin_not_allowed", "Origen no permitido")
                if self.headers.get("Access-Control-Request-Method") not in ("GET", "POST", "PUT", "DELETE"):
                    raise APIError(400, "invalid_preflight", "Método no admitido")
                requested = {item.strip().lower() for item in self.headers.get("Access-Control-Request-Headers", "").split(",") if item.strip()}
                if requested - {"authorization", "content-type"}:
                    raise APIError(400, "invalid_preflight", "Cabecera no admitida")
                self.respond(204)
                return
            if self.command == "GET" and path == "/health" and not query:
                connection = connect(self.server.config.database, self.server.config.busy_timeout, readonly=True)
                assert_ready(connection)
                self.respond(200, {"ok": True})
                return
            connection = connect(self.server.config.database, self.server.config.busy_timeout)
            device_id = self.authenticate(connection)
            if self.command == "GET":
                self.respond(200, self.get(connection, path, query))
            else:
                status, response = self.mutate(connection, device_id, path, query)
                self.respond(status, response)
        except APIError as exc:
            self.respond(exc.status, exc.payload)
        except sqlite3.OperationalError as exc:
            if "locked" in str(exc).lower() or "busy" in str(exc).lower():
                self.respond(503, {"error": "database_busy", "message": "Guardado pendiente; reintenta en unos segundos"})
            else:
                self.respond(500, {"error": "database_error", "message": "No se pudo acceder a la base"})
        except (ValueError, sqlite3.Error):
            self.respond(500, {"error": "internal_error", "message": "No se pudo completar la operación"})
        except (socket.timeout, ConnectionError, BrokenPipeError):
            # La operación confirmada antes de una desconexión permanece recuperable por UUID.
            pass
        finally:
            if connection:
                connection.close()

    do_GET = dispatch
    do_POST = dispatch
    do_PUT = dispatch
    do_DELETE = dispatch
    do_OPTIONS = dispatch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=os.environ.get("SQLITE_DB_PATH"), type=Path)
    parser.add_argument("--host", default=os.environ.get("SQLITE_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("SQLITE_PORT", "8765")))
    parser.add_argument("--allowed-origin", action="append", default=None)
    parser.add_argument("--busy-timeout", type=float, default=2.0)
    parser.add_argument("--access-mode", choices=("token", "public"), default=os.environ.get("SQLITE_ACCESS_MODE", "token"))
    args = parser.parse_args()
    if args.db is None:
        parser.error("Indica --db o SQLITE_DB_PATH")
    origins = args.allowed_origin if args.allowed_origin is not None else [origin.strip() for origin in os.environ.get("SQLITE_ALLOWED_ORIGINS", "").split(",") if origin.strip()]
    for origin in origins:
        parsed = urlsplit(origin)
        if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username:
            parser.error("Cada origen debe tener formato https://dominio sin ruta")
    if not 0 < args.busy_timeout <= 10:
        parser.error("--busy-timeout debe estar entre 0 y 10 segundos")
    try:
        server = APIServer((args.host, args.port), Config(args.db, tuple(origins), args.busy_timeout, access_mode=args.access_mode))
    except (OSError, sqlite3.Error, ValueError) as exc:
        parser.exit(1, f"No se pudo iniciar la API: {exc}\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
