# Testing Setup for Thinker Frontend

## Installation

To enable testing, install the following dev dependencies:

```bash
npm install -D vitest @vitest/ui jsdom
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install -D @types/node
```

## Package.json Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm test -- --watch
```

### Run tests with UI
```bash
npm run test:ui
```

### Run tests with coverage
```bash
npm run test:coverage
```

## Test Structure

Tests are located in:
- `src/__tests__/` - Component tests
- `src/test/setup.ts` - Test configuration

## Writing Tests

Example test file:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MyComponent from '../components/MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

## Configuration

- `vitest.config.ts` - Vitest configuration
- `src/test/setup.ts` - Global test setup

## Coverage

Coverage reports are generated in the `coverage/` directory.

Target coverage: 80% for critical components
