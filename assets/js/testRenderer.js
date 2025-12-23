/**
 * TestRenderer - Gestión del DOM y UI para el sistema de tests (v3.0)
 * 
 * Se encarga de mostrar preguntas, resultados y gestionar la vista slider.
 * Este módulo elimina la necesidad de handlers inline (onclick) en el HTML.
 */

import StateManager from './stateManager.js';

const TestRenderer = {
    _sliderObserver: null,

    // Referencias a elementos del DOM (se obtienen dinámicamente)
    get elements() {
        return {
            testView: document.getElementById('test-view'),
            resultadoView: document.getElementById('result-view'),
            questionsContainer: document.getElementById('questions-container'),
            resultadoContainer: document.getElementById('result-container'),
            form: document.getElementById('questions-form'),
            testControls: document.getElementById('test-controls'),
            listIcon: document.getElementById('icon-view-list'),
            sliderIcon: document.getElementById('icon-view-slider'),
            btnToggle: document.getElementById('view-mode-toggle'),
            btnFinishActive: document.getElementById('btn-finish'),
            btnBackHome: document.getElementById('btn-back-home'),
            btnBackHomeResult: document.getElementById('btn-back-home-result')
        };
    },

    /**
     * Renderiza todas las preguntas en el contenedor
     * @param {Array} questions - Array de preguntas
     * @param {Function} onAnswerChange - Callback para cuando cambia una respuesta
     */
    renderQuestions(questions, onAnswerChange) {
        const { questionsContainer } = this.elements;
        if (!questionsContainer) return;

        let html = '';
        questions.forEach((pregunta, index) => {
            const isAuto = pregunta.autogenerado === true;
            const borderClass = isAuto ? 'border-purple-500 dark:border-purple-500/80' : 'border-primary dark:border-primary/80';
            const numberBgClass = isAuto ? 'bg-purple-600 dark:bg-purple-900/50' : 'bg-primary';

            const autoBadge = isAuto
                ? `<span class="ml-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-600 text-white dark:bg-purple-900/50 dark:text-purple-300 dark:border dark:border-purple-700/50 shadow-sm">✨ IA</span>`
                : '';

            html += `
                <div class="bg-white rounded-xl shadow-md p-6 md:p-8 border-l-4 ${borderClass} hover:shadow-lg transition-shadow duration-300 dark:bg-gray-800" id="pregunta-${index}">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="${numberBgClass} text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">${index + 1}</span>
                        ${autoBadge}
                    </div>
                    <p class="text-base md:text-lg text-dark font-medium mb-5 leading-relaxed">${pregunta.enunciado}</p>
                    <div class="space-y-3">
            `;

            pregunta.opciones.forEach((opcion, opcionIndex) => {
                const optionValue = opcionIndex + 1;
                html += `
                    <label class="flex items-start p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-primary/10 hover:border-primary border-2 border-transparent transition-all duration-200 group dark:bg-gray-700/50 dark:hover:bg-primary/20 dark:hover:border-primary/50">
                        <input
                            type="radio"
                            name="pregunta-${index}"
                            value="${optionValue}"
                            class="question-option mt-1 w-5 h-5 text-primary focus:ring-primary focus:ring-2 cursor-pointer dark:bg-gray-600 dark:border-gray-500"
                        >
                        <span class="ml-3 text-gray-700 group-hover:text-dark font-medium flex-1 dark:text-gray-300 dark:group-hover:text-gray-100">${opcion}</span>
                    </label>
                `;
            });

            html += `</div></div>`;
        });

        questionsContainer.innerHTML = html;

        // Añadir listeners para las respuestas
        questionsContainer.querySelectorAll('.question-option').forEach(input => {
            input.addEventListener('change', (e) => {
                const qIndex = parseInt(e.target.name.split('-')[1]);
                const value = parseInt(e.target.value);
                if (onAnswerChange) onAnswerChange(qIndex, value);
            });
        });
    },

    /**
     * Muestra el resultado del test
     * @param {Object} results - Objeto con datos del resultado (generado por TestEngine)
     * @param {string} title - Título del test
     */
    displayResult(results, title) {
        const { resultadoContainer, testView, resultadoView, questionsContainer } = this.elements;
        if (!resultadoContainer) return;

        const percentage = results.score.toFixed(1);

        let html = `
            <div class="glass-card p-8">
                <div class="text-center mb-8">
                    <h2 class="text-3xl font-bold text-dark mb-2">🎯 Resultado del Test</h2>
                    <h3 class="text-xl text-dark dark:text-gray-300">${title}</h3>
                </div>
                
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                    <div class="bg-gradient-to-br from-green-400 to-green-600 rounded-xl p-4 text-white shadow-lg">
                        <div class="text-xs font-medium mb-1 opacity-90">Aciertos</div>
                        <div class="text-2xl md:text-3xl font-bold">${results.aciertos}</div>
                    </div>
                    <div class="bg-gradient-to-br from-red-400 to-red-600 rounded-xl p-4 text-white shadow-lg">
                        <div class="text-xs font-medium mb-1 opacity-90">Errores</div>
                        <div class="text-2xl md:text-3xl font-bold">${results.errores}</div>
                    </div>
                    <div class="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl p-4 text-white shadow-lg">
                        <div class="text-xs font-medium mb-1 opacity-90">En blanco</div>
                        <div class="text-2xl md:text-3xl font-bold">${results.blancos}</div>
                    </div>
                    <div class="bg-gradient-to-br from-primary to-secondary rounded-xl p-4 text-white shadow-lg">
                        <div class="text-xs font-medium mb-1 opacity-90">Puntuación</div>
                        <div class="text-2xl md:text-3xl font-bold">${percentage}%</div>
                    </div>
                </div>

                <h3 class="text-2xl font-bold text-dark mb-6 flex items-center gap-2">
                    <span>📝</span> Detalle de respuestas
                </h3>
                <div class="space-y-4">
        `;

        results.detalle.forEach((detalle, index) => {
            const statusIcon = detalle.enBlanco ? '⚪' : (detalle.esCorrecta ? '✅' : '❌');
            const borderColor = detalle.enBlanco ? 'border-yellow-400' : (detalle.esCorrecta ? 'border-green-500' : 'border-red-500');

            html += `
                <div class="bg-white rounded-xl shadow-md p-6 border-l-4 ${borderColor} dark:bg-gray-800">
                    <div class="flex items-center gap-2 mb-4">
                        <span class="text-2xl">${statusIcon}</span>
                        <span class="font-semibold text-dark dark:text-gray-100">Pregunta ${index + 1}</span>
                    </div>
                    <p class="text-dark font-medium mb-4 dark:text-gray-300">${detalle.pregunta}</p>
                    <div class="space-y-2">
            `;

            detalle.opciones.forEach((opcion, opcionIndex) => {
                const optionValue = opcionIndex + 1;
                const isUserAnswer = optionValue === detalle.respuestaUsuario;
                const isCorrectAnswer = optionValue === detalle.respuestaCorrecta;

                let optionClass = 'p-3 rounded-lg border-2 ';
                let marcador = '';
                let iconoOpcion = '';

                if (isCorrectAnswer) {
                    optionClass += 'bg-success-light border-success-bright text-success-bright dark:bg-green-900/40 dark:text-green-300';
                    marcador = '✓';
                    iconoOpcion = '✅';
                } else if (isUserAnswer && !isCorrectAnswer) {
                    optionClass += 'bg-danger-light border-danger-bright text-danger-bright dark:bg-red-900/40 dark:text-red-300';
                    marcador = '✗';
                    iconoOpcion = '❌';
                } else {
                    optionClass += 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-700/50 dark:border-gray-600 dark:text-gray-400';
                }

                html += `
                    <div class="${optionClass} flex items-center gap-2">
                        ${iconoOpcion ? `<span class="text-lg">${iconoOpcion}</span>` : ''}
                        <span class="font-medium">${marcador ? marcador + ' ' : ''}${opcion}</span>
                    </div>
                `;
            });

            html += `</div></div>`;
        });

        html += `</div></div>`;
        resultadoContainer.innerHTML = html;

        // Limpiar navegación de slider si estaba activa
        this.removeSliderNavigation();
        document.body.classList.remove('slider-view-active');
        if (questionsContainer) {
            questionsContainer.classList.remove('slider-mode');
            questionsContainer.classList.add('space-y-6');
        }

        // Cambiar vistas
        if (testView) testView.style.display = 'none';
        if (resultadoView) resultadoView.style.display = 'block';
        window.scrollTo(0, 0);
    },

    /**
     * Sincroniza la UI con el modo de vista actual
     */
    updateViewModeUI(onGradeTest, onScrollSlider) {
        const { listIcon, sliderIcon, questionsContainer, testControls, form } = this.elements;
        const currentViewMode = StateManager.get('currentViewMode');

        let syncIndex = 0;
        if (currentViewMode === 'slider') {
            syncIndex = this.getCurrentQuestionIndexInListMode();
        } else if (questionsContainer) {
            const items = Array.from(questionsContainer.children).filter(el =>
                (el.id && el.id.startsWith('pregunta-')) || el.id === 'test-controls'
            );
            const scrollUnit = (items.length >= 2) ? (items[1].offsetLeft - items[0].offsetLeft) : questionsContainer.offsetWidth;
            if (scrollUnit > 0) {
                syncIndex = Math.round(questionsContainer.scrollLeft / scrollUnit);
            }
        }

        if (listIcon && sliderIcon) {
            listIcon.classList.toggle('hidden', currentViewMode !== 'slider');
            sliderIcon.classList.toggle('hidden', currentViewMode === 'slider');
        }

        if (currentViewMode === 'slider') {
            const savedScrollY = window.scrollY;
            document.body.classList.add('slider-view-active');
            window.scrollTo(0, savedScrollY);

            if (questionsContainer) {
                questionsContainer.classList.add('slider-mode');
                questionsContainer.classList.remove('space-y-6');
                if (testControls && testControls.parentNode !== questionsContainer) {
                    questionsContainer.appendChild(testControls);
                }
                this.addSliderNavigation(syncIndex, onGradeTest, onScrollSlider);
            }

            requestAnimationFrame(() => {
                window.scrollTo(0, savedScrollY);
                if (questionsContainer) {
                    const items = Array.from(questionsContainer.children).filter(el => el.id && el.id.startsWith('pregunta-'));
                    const scrollUnit = (items.length >= 2) ? (items[1].offsetLeft - items[0].offsetLeft) : questionsContainer.offsetWidth;
                    questionsContainer.scrollTo({ left: syncIndex * scrollUnit, behavior: 'auto' });
                }
            });
        } else {
            document.body.classList.remove('slider-view-active');
            if (questionsContainer) {
                questionsContainer.classList.remove('slider-mode');
                questionsContainer.classList.add('space-y-6');
                questionsContainer.style.height = '';
                if (testControls && testControls.parentNode === questionsContainer && form) {
                    form.after(testControls);
                }
            }
            if (form) form.style.height = '';
            this.removeSliderNavigation();

            requestAnimationFrame(() => {
                const targetEl = document.getElementById(`pregunta-${syncIndex}`);
                if (targetEl) {
                    const offsetPosition = targetEl.getBoundingClientRect().top + window.scrollY - 100;
                    window.scrollTo({ top: offsetPosition, behavior: 'auto' });
                }
            });
        }
    },

    getCurrentQuestionIndexInListMode() {
        const { questionsContainer } = this.elements;
        if (!questionsContainer || window.scrollY < 150) return 0;

        const items = Array.from(questionsContainer.children).filter(el => el.id && el.id.startsWith('pregunta-'));
        if (items.length === 0) return 0;
        const focusPoint = window.innerHeight * 0.5;

        for (let i = 0; i < items.length; i++) {
            if (items[i].getBoundingClientRect().bottom > focusPoint) return i;
        }
        return items.length - 1;
    },

    addSliderNavigation(startIndex, onGradeTest, onScrollSlider) {
        let nav = document.getElementById('slider-nav-controls');
        if (!nav) {
            nav = document.createElement('div');
            nav.id = 'slider-nav-controls';
            nav.className = 'slider-controls-container';

            nav.innerHTML = `
                <button id="slider-prev" class="bg-white/90 backdrop-blur hover:bg-white text-gray-800 font-bold py-3 px-6 rounded-full shadow-lg border border-gray-200 dark:bg-gray-800/90 dark:text-white dark:border-gray-700 transition-all transform hover:scale-105 flex items-center gap-2">
                    \u2190 <span class="hidden md:inline">Anterior</span><span class="md:hidden">Ant.</span>
                </button>
                <button id="slider-next" class="bg-primary hover:bg-primary/90 text-white font-bold py-3 px-6 rounded-full shadow-lg transition-all transform hover:scale-105 flex items-center gap-2">
                    <span class="hidden md:inline">Siguiente</span><span class="md:hidden">Sig.</span> \u2192
                </button>
                <button id="slider-finish" class="bg-primary hover:bg-secondary text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all transform hover:scale-105 flex items-center gap-2">
                    \ud83c\udfc1 <span class="hidden md:inline">Finalizar y Corregir</span><span class="md:hidden">Finalizar</span>
                </button>
            `;
            document.body.appendChild(nav);

            document.getElementById('slider-prev').addEventListener('click', () => onScrollSlider(-1));
            document.getElementById('slider-next').addEventListener('click', () => onScrollSlider(1));
            document.getElementById('slider-finish').addEventListener('click', onGradeTest);
        }
        this.setupSliderObserver(startIndex);
    },

    setupSliderObserver(startIndex = 0) {
        const { questionsContainer, form } = this.elements;
        if (!questionsContainer || !form) return;

        if (this._sliderObserver) {
            this._sliderObserver.disconnect();
        }

        StateManager.set({ lastSliderIndex: -1 });

        const options = {
            root: questionsContainer,
            threshold: 0.6
        };

        this._sliderObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const targetId = entry.target.id;
                    let newIndex = -1;

                    if (targetId === 'test-controls') {
                        const items = Array.from(questionsContainer.children).filter(el =>
                            (el.id && el.id.startsWith('pregunta-')) || el.id === 'test-controls'
                        );
                        newIndex = items.findIndex(el => el.id === 'test-controls');
                    } else if (targetId && targetId.startsWith('pregunta-')) {
                        newIndex = parseInt(targetId.replace('pregunta-', ''));
                    }

                    const lastSliderIndex = StateManager.get('lastSliderIndex');
                    if (newIndex !== -1 && newIndex !== lastSliderIndex) {
                        StateManager.set({ lastSliderIndex: newIndex });

                        const targetEl = document.getElementById(targetId);
                        if (targetEl) {
                            const offsetPosition = targetEl.getBoundingClientRect().top + window.scrollY - 100;
                            window.scrollTo({ top: offsetPosition, behavior: 'instant' });
                        }

                        this.updateSliderControlsState(newIndex);

                        setTimeout(() => {
                            if (form && entry.isIntersecting) {
                                form.style.height = (entry.target.offsetHeight + 150) + 'px';
                            }
                        }, 300);
                    }
                }
            });
        }, options);

        const items = Array.from(questionsContainer.children).filter(el =>
            (el.id && el.id.startsWith('pregunta-')) || el.id === 'test-controls'
        );
        items.forEach(item => this._sliderObserver.observe(item));
    },

    updateSliderControlsState(activeIndex) {
        const { questionsContainer } = this.elements;
        const btnPrev = document.getElementById('slider-prev');
        const btnNext = document.getElementById('slider-next');
        const btnFinish = document.getElementById('slider-finish');

        if (!btnPrev || !btnNext || !btnFinish || !questionsContainer) return;

        const items = Array.from(questionsContainer.children).filter(el =>
            (el.id && el.id.startsWith('pregunta-')) || el.id === 'test-controls'
        );
        const totalItems = items.length;

        btnPrev.style.display = activeIndex === 0 ? 'none' : 'flex';

        if (activeIndex >= totalItems - 2) {
            btnNext.style.display = 'none';
            btnFinish.style.display = 'flex';
        } else {
            btnNext.style.display = 'flex';
            btnFinish.style.display = 'none';
        }
    },

    removeSliderNavigation() {
        if (this._sliderObserver) {
            this._sliderObserver.disconnect();
            this._sliderObserver = null;
        }
        const nav = document.getElementById('slider-nav-controls');
        if (nav) nav.remove();
    },

    scrollSlider(direction) {
        const { questionsContainer } = this.elements;
        if (!questionsContainer) return;

        const items = Array.from(questionsContainer.children).filter(el =>
            (el.id && el.id.startsWith('pregunta-')) || el.id === 'test-controls'
        );
        const scrollUnit = (items.length >= 2) ? (items[1].offsetLeft - items[0].offsetLeft) : questionsContainer.offsetWidth;

        questionsContainer.scrollBy({
            left: direction * scrollUnit,
            behavior: 'smooth'
        });
    }
};

export default TestRenderer;
