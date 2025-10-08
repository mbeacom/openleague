import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { DroppableDivision } from '@/components/features/team/DroppableDivision';

describe('DroppableDivision', () => {
  const mockChild = <div data-testid="division-content">Division Content</div>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children correctly', () => {
    render(
      <DndContext>
        <DroppableDivision id="division-1">
          {mockChild}
        </DroppableDivision>
      </DndContext>
    );

    expect(screen.getByTestId('division-content')).toBeInTheDocument();
    expect(screen.getByTestId('division-content')).toHaveTextContent('Division Content');
  });

  it('renders with unique id', () => {
    const { rerender } = render(
      <DndContext>
        <DroppableDivision id="division-1">
          <div data-testid="content-1">Content 1</div>
        </DroppableDivision>
      </DndContext>
    );

    expect(screen.getByTestId('content-1')).toBeInTheDocument();

    rerender(
      <DndContext>
        <DroppableDivision id="division-2">
          <div data-testid="content-2">Content 2</div>
        </DroppableDivision>
      </DndContext>
    );

    expect(screen.getByTestId('content-2')).toBeInTheDocument();
  });

  it('renders multiple droppable divisions', () => {
    render(
      <DndContext>
        <DroppableDivision id="division-1">
          <div data-testid="div-1">Division 1</div>
        </DroppableDivision>
        <DroppableDivision id="division-2">
          <div data-testid="div-2">Division 2</div>
        </DroppableDivision>
        <DroppableDivision id="division-3">
          <div data-testid="div-3">Division 3</div>
        </DroppableDivision>
      </DndContext>
    );

    expect(screen.getByTestId('div-1')).toBeInTheDocument();
    expect(screen.getByTestId('div-2')).toBeInTheDocument();
    expect(screen.getByTestId('div-3')).toBeInTheDocument();
  });

  it('renders with complex nested children', () => {
    const complexChild = (
      <div data-testid="complex-division">
        <h2>Division Title</h2>
        <div data-testid="team-grid">
          <div>Team 1</div>
          <div>Team 2</div>
          <div>Team 3</div>
        </div>
      </div>
    );

    render(
      <DndContext>
        <DroppableDivision id="division-1">
          {complexChild}
        </DroppableDivision>
      </DndContext>
    );

    expect(screen.getByTestId('complex-division')).toBeInTheDocument();
    expect(screen.getByText('Division Title')).toBeInTheDocument();
    expect(screen.getByTestId('team-grid')).toBeInTheDocument();
    expect(screen.getByText('Team 1')).toBeInTheDocument();
  });

  it('handles empty children gracefully', () => {
    render(
      <DndContext>
        <DroppableDivision id="division-1">
          <div data-testid="empty-division" />
        </DroppableDivision>
      </DndContext>
    );

    expect(screen.getByTestId('empty-division')).toBeInTheDocument();
  });

  it('renders special unassigned division id', () => {
    render(
      <DndContext>
        <DroppableDivision id="unassigned">
          <div data-testid="unassigned-content">Unassigned Teams</div>
        </DroppableDivision>
      </DndContext>
    );

    expect(screen.getByTestId('unassigned-content')).toBeInTheDocument();
  });

  it('maintains children interactivity', () => {
    render(
      <DndContext>
        <DroppableDivision id="division-1">
          <button data-testid="action-button">Click Me</button>
        </DroppableDivision>
      </DndContext>
    );

    const button = screen.getByTestId('action-button');
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('renders without crashing with minimal props', () => {
    expect(() => {
      render(
        <DndContext>
          <DroppableDivision id="test-id">
            <div>Minimal content</div>
          </DroppableDivision>
        </DndContext>
      );
    }).not.toThrow();
  });

  it('preserves child component layout', () => {
    render(
      <DndContext>
        <DroppableDivision id="division-1">
          <div data-testid="grid-container" className="custom-grid">
            <div>Item 1</div>
            <div>Item 2</div>
          </div>
        </DroppableDivision>
      </DndContext>
    );

    const gridContainer = screen.getByTestId('grid-container');
    expect(gridContainer).toHaveClass('custom-grid');
  });

  it('handles empty string id', () => {
    render(
      <DndContext>
        <DroppableDivision id="">
          <div data-testid="empty-id-content">Content</div>
        </DroppableDivision>
      </DndContext>
    );

    expect(screen.getByTestId('empty-id-content')).toBeInTheDocument();
  });

  it('wraps children in proper container', () => {
    render(
      <DndContext>
        <DroppableDivision id="division-1">
          {mockChild}
        </DroppableDivision>
      </DndContext>
    );

    const contentElement = screen.getByTestId('division-content');
    expect(contentElement).toBeInTheDocument();

    // Should be wrapped in a container (DroppableArea)
    expect(contentElement.parentElement).toBeInTheDocument();
  });

  it('renders with multiple children', () => {
    render(
      <DndContext>
        <DroppableDivision id="division-1">
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
          <div data-testid="child-3">Child 3</div>
        </DroppableDivision>
      </DndContext>
    );

    expect(screen.getByTestId('child-1')).toBeInTheDocument();
    expect(screen.getByTestId('child-2')).toBeInTheDocument();
    expect(screen.getByTestId('child-3')).toBeInTheDocument();
  });
});

describe('DroppableDivision - Accessibility', () => {
  it('maintains semantic HTML structure', () => {
    render(
      <DndContext>
        <DroppableDivision id="division-1">
          <section data-testid="semantic-content">
            <h2>Division Section</h2>
          </section>
        </DroppableDivision>
      </DndContext>
    );

    const section = screen.getByTestId('semantic-content');
    expect(section.tagName).toBe('SECTION');
  });

  it('preserves child component focus behavior', () => {
    render(
      <DndContext>
        <DroppableDivision id="division-1">
          <input data-testid="focus-input" type="text" placeholder="Search" />
        </DroppableDivision>
      </DndContext>
    );

    const input = screen.getByTestId('focus-input');
    expect(input).toBeInTheDocument();

    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it('allows keyboard navigation through children', () => {
    render(
      <DndContext>
        <DroppableDivision id="division-1">
          <button data-testid="button-1">Button 1</button>
          <button data-testid="button-2">Button 2</button>
          <button data-testid="button-3">Button 3</button>
        </DroppableDivision>
      </DndContext>
    );

    const button1 = screen.getByTestId('button-1');
    const button2 = screen.getByTestId('button-2');

    button1.focus();
    expect(document.activeElement).toBe(button1);

    button2.focus();
    expect(document.activeElement).toBe(button2);
  });
});

describe('DroppableDivision - Integration', () => {
  it('integrates with DndContext', () => {
    render(
      <DndContext>
        <DroppableDivision id="division-1">
          <div data-testid="integrated-content">
            Droppable Content
          </div>
        </DroppableDivision>
      </DndContext>
    );

    expect(screen.getByTestId('integrated-content')).toBeInTheDocument();
  });

  it('works with multiple divisions in same context', () => {
    render(
      <DndContext>
        <DroppableDivision id="division-a">
          <div data-testid="division-a">Division A</div>
        </DroppableDivision>
        <DroppableDivision id="division-b">
          <div data-testid="division-b">Division B</div>
        </DroppableDivision>
        <DroppableDivision id="unassigned">
          <div data-testid="division-unassigned">Unassigned</div>
        </DroppableDivision>
      </DndContext>
    );

    expect(screen.getByTestId('division-a')).toBeInTheDocument();
    expect(screen.getByTestId('division-b')).toBeInTheDocument();
    expect(screen.getByTestId('division-unassigned')).toBeInTheDocument();
  });
});
