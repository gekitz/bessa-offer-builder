import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount all React components and clear DOM after every test
afterEach(() => {
  cleanup();
});
