import { InputState } from '../types';

export function createInputState(): InputState {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    chop: false,
    interact: false,
  };
}

export function setupInputHandlers(inputState: InputState): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        inputState.up = true;
        break;
      case 's':
      case 'arrowdown':
        inputState.down = true;
        break;
      case 'a':
      case 'arrowleft':
        inputState.left = true;
        break;
      case 'd':
      case 'arrowright':
        inputState.right = true;
        break;
      case ' ':
        e.preventDefault();
        inputState.chop = true;
        break;
      case 'e':
        inputState.interact = true;
        break;
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    switch (e.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        inputState.up = false;
        break;
      case 's':
      case 'arrowdown':
        inputState.down = false;
        break;
      case 'a':
      case 'arrowleft':
        inputState.left = false;
        break;
      case 'd':
      case 'arrowright':
        inputState.right = false;
        break;
      case ' ':
        inputState.chop = false;
        break;
      case 'e':
        inputState.interact = false;
        break;
    }
  };

  // Mouse click for chopping
  const handleMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      inputState.chop = true;
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      inputState.chop = false;
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mouseup', handleMouseUp);

  // Return cleanup function
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('mousedown', handleMouseDown);
    window.removeEventListener('mouseup', handleMouseUp);
  };
}
