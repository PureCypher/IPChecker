import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchSection } from '../SearchSection';

describe('SearchSection', () => {
  const defaultProps = {
    onSearch: vi.fn(),
    isLoading: false,
    searchHistory: [] as string[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Rendering ────────────────────────────────────────────────

  it('renders the search input and submit button', () => {
    render(<SearchSection {...defaultProps} />);

    expect(screen.getByLabelText('IP address input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /lookup ip/i })).toBeInTheDocument();
  });

  it('renders the heading', () => {
    render(<SearchSection {...defaultProps} />);

    expect(screen.getByText('Lookup IP Address')).toBeInTheDocument();
  });

  it('renders quick example buttons', () => {
    render(<SearchSection {...defaultProps} />);

    expect(screen.getByText('8.8.8.8')).toBeInTheDocument();
    expect(screen.getByText('1.1.1.1')).toBeInTheDocument();
    expect(screen.getByText('208.67.222.222')).toBeInTheDocument();
  });

  it('renders search history when provided', () => {
    render(
      <SearchSection
        {...defaultProps}
        searchHistory={['1.2.3.4', '5.6.7.8']}
      />
    );

    expect(screen.getByText('Recent Searches:')).toBeInTheDocument();
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument();
    expect(screen.getByText('5.6.7.8')).toBeInTheDocument();
  });

  it('does not render search history section when history is empty', () => {
    render(<SearchSection {...defaultProps} />);

    expect(screen.queryByText('Recent Searches:')).not.toBeInTheDocument();
  });

  // ─── Form Submission & Validation ─────────────────────────────

  it('calls onSearch with a valid IPv4 address on submit', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchSection {...defaultProps} onSearch={onSearch} />);

    const input = screen.getByLabelText('IP address input');
    await user.type(input, '8.8.8.8');
    await user.click(screen.getByRole('button', { name: /lookup ip/i }));

    expect(onSearch).toHaveBeenCalledWith('8.8.8.8');
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('trims and lowercases the IP before calling onSearch', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchSection {...defaultProps} onSearch={onSearch} />);

    const input = screen.getByLabelText('IP address input');
    await user.type(input, '  8.8.8.8  ');
    await user.click(screen.getByRole('button', { name: /lookup ip/i }));

    expect(onSearch).toHaveBeenCalledWith('8.8.8.8');
  });

  it('shows an error when submitting with an empty input', async () => {
    const user = userEvent.setup();
    render(<SearchSection {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /lookup ip/i }));

    expect(screen.getByText('Please enter an IP address')).toBeInTheDocument();
    expect(defaultProps.onSearch).not.toHaveBeenCalled();
  });

  it('shows an error for an invalid IP address format', async () => {
    const user = userEvent.setup();
    render(<SearchSection {...defaultProps} />);

    const input = screen.getByLabelText('IP address input');
    await user.type(input, 'not-an-ip');
    await user.click(screen.getByRole('button', { name: /lookup ip/i }));

    expect(screen.getByText('Invalid IP address format')).toBeInTheDocument();
    expect(defaultProps.onSearch).not.toHaveBeenCalled();
  });

  it('shows an error for a private IP address', async () => {
    const user = userEvent.setup();
    render(<SearchSection {...defaultProps} />);

    const input = screen.getByLabelText('IP address input');
    await user.type(input, '192.168.1.1');
    await user.click(screen.getByRole('button', { name: /lookup ip/i }));

    expect(
      screen.getByText('Private IP addresses cannot be looked up')
    ).toBeInTheDocument();
    expect(defaultProps.onSearch).not.toHaveBeenCalled();
  });

  it('clears the previous error when submitting a valid IP', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchSection {...defaultProps} onSearch={onSearch} />);

    const input = screen.getByLabelText('IP address input');

    // First submit with invalid input
    await user.type(input, 'invalid');
    await user.click(screen.getByRole('button', { name: /lookup ip/i }));
    expect(screen.getByText('Invalid IP address format')).toBeInTheDocument();

    // Clear and submit with valid input
    await user.clear(input);
    await user.type(input, '8.8.8.8');
    await user.click(screen.getByRole('button', { name: /lookup ip/i }));

    expect(screen.queryByText('Invalid IP address format')).not.toBeInTheDocument();
    expect(onSearch).toHaveBeenCalledWith('8.8.8.8');
  });

  // ─── Loading State ────────────────────────────────────────────

  it('disables the submit button and input while loading', () => {
    render(<SearchSection {...defaultProps} isLoading={true} />);

    expect(screen.getByLabelText('IP address input')).toBeDisabled();
    expect(screen.getByRole('button', { name: /searching/i })).toBeDisabled();
  });

  it('shows "Searching..." text on the button while loading', () => {
    render(<SearchSection {...defaultProps} isLoading={true} />);

    expect(screen.getByText('Searching...')).toBeInTheDocument();
  });

  it('disables example buttons while loading', () => {
    render(<SearchSection {...defaultProps} isLoading={true} />);

    const exampleButtons = screen.getAllByRole('button').filter(
      (btn) => btn.textContent === '8.8.8.8' ||
               btn.textContent === '1.1.1.1' ||
               btn.textContent === '208.67.222.222'
    );

    exampleButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  // ─── Example & History Click ──────────────────────────────────

  it('calls onSearch when clicking an example IP button', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchSection {...defaultProps} onSearch={onSearch} />);

    await user.click(screen.getByText('1.1.1.1'));

    expect(onSearch).toHaveBeenCalledWith('1.1.1.1');
  });

  it('calls onSearch when clicking a history entry', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(
      <SearchSection
        {...defaultProps}
        onSearch={onSearch}
        searchHistory={['4.4.4.4']}
      />
    );

    await user.click(screen.getByText('4.4.4.4'));

    expect(onSearch).toHaveBeenCalledWith('4.4.4.4');
  });

  // ─── Clear Input Button ───────────────────────────────────────

  it('shows and operates the clear input button when text is present', async () => {
    const user = userEvent.setup();
    render(<SearchSection {...defaultProps} />);

    const input = screen.getByLabelText('IP address input');

    // Clear button should not exist initially
    expect(screen.queryByLabelText('Clear input')).not.toBeInTheDocument();

    // Type something
    await user.type(input, '8.8.8.8');

    // Clear button should now be visible
    const clearButton = screen.getByLabelText('Clear input');
    expect(clearButton).toBeInTheDocument();

    // Click clear
    await user.click(clearButton);

    expect(input).toHaveValue('');
  });
});
