import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Global setup for mocks if needed
vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
}));
