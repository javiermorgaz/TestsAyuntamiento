/**
 * @jest-environment jsdom
 */

// Mock globals
global.console = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

// Mock getSupabaseClient global
const mockSupabase = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
};
global.getSupabaseClient = jest.fn().mockResolvedValue(mockSupabase);

const supabaseService = require('../assets/js/supabase-service.js');

describe('Supabase Service (Schema Verification)', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset mock chain return values
        mockSupabase.from.mockReturnValue(mockSupabase);
        mockSupabase.select.mockReturnValue(mockSupabase);
        mockSupabase.eq.mockReturnValue(mockSupabase);
        mockSupabase.order.mockReturnValue(mockSupabase);
        mockSupabase.limit.mockReturnValue(mockSupabase);
        mockSupabase.single.mockReturnValue(mockSupabase);
        mockSupabase.insert.mockReturnValue(mockSupabase);
        mockSupabase.update.mockReturnValue(mockSupabase);
        mockSupabase.delete.mockReturnValue(mockSupabase);
    });

    test('fetchTestInProgress should query "results" table with correct columns', async () => {
        mockSupabase.single.mockResolvedValue({ data: { id: 1 }, error: null });
        mockSupabase.limit.mockResolvedValue({ data: [{ id: 1 }], error: null }); // Handling the logic change

        await supabaseService.fetchTestInProgress(123);

        // Verify Table Name
        expect(mockSupabase.from).toHaveBeenCalledWith('results');

        // Verify Columns (implicit in select *)
        expect(mockSupabase.select).toHaveBeenCalledWith('*');

        // Verify Filter (Foreign Key)
        expect(mockSupabase.eq).toHaveBeenCalledWith('test_id', 123);
    });

    test('saveTestProgress should insert into "results" with correct schema fields', async () => {
        mockSupabase.single.mockResolvedValue({ data: { id: 1 }, error: null });

        const mockData = {
            test_id: 1,
            answers_data: [1, 2, 3],
            total_questions: 3
        };

        await supabaseService.saveTestProgress(mockData);

        expect(mockSupabase.from).toHaveBeenCalledWith('results');
        expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
            test_id: expect.any(Number),
            status: 'in_progress',
            answers_data: expect.any(Array),
            total_questions: expect.any(Number)
        }));
    });

    test('completeTestSupabase should update "results" with correct schema fields', async () => {
        mockSupabase.single.mockResolvedValue({ data: { id: 1 }, error: null });

        const mockResult = {
            id: 55,
            score_percentage: 80,
            total_correct: 8,
            total_questions: 10,
            answers_data: [1, 2]
        };

        await supabaseService.completeTestSupabase(mockResult);

        expect(mockSupabase.from).toHaveBeenCalledWith('results');
        expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
            status: 'in_progress', // Verified logic change from previous step
            score_percentage: 80,
            total_correct: 8,
            total_questions: 10,
            answers_data: expect.any(Array)
        }));
        expect(mockSupabase.eq).toHaveBeenCalledWith('id', 55);
    });

    test('fetchTestsFromSupabase should query "tests" table', async () => {
        mockSupabase.order.mockResolvedValue({ data: [], error: null });

        await supabaseService.fetchTestsFromSupabase();

        expect(mockSupabase.from).toHaveBeenCalledWith('tests');
        expect(mockSupabase.select).toHaveBeenCalledWith('*');
    });

});
