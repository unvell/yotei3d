import { describe, it, expect } from 'vitest';
import { EventDispatcher } from './event';

// Set up a class wired with the prototype-based event dispatcher once.
class Widget {}
const ed = new EventDispatcher(Widget);
ed.registerEvents('click', 'hover');

const make = () => new Widget() as any;

describe('EventDispatcher', () => {
  it('addEventListener registers a handler that fires via on<event>()', () => {
    const w = make();
    let calls = 0;
    w.addEventListener('click', () => { calls++; });
    w.onclick();
    expect(calls).toBe(1);
  });

  it('on() is an alias for addEventListener', () => {
    const w = make();
    let calls = 0;
    w.on('click', () => { calls++; });
    w.onclick();
    expect(calls).toBe(1);
  });

  it('multiple listeners all fire, in registration order', () => {
    const w = make();
    const order: number[] = [];
    w.addEventListener('click', () => order.push(1));
    w.addEventListener('click', () => order.push(2));
    w.onclick();
    expect(order).toEqual([1, 2]);
  });

  it('a listener returning true stops propagation to later listeners', () => {
    const w = make();
    const order: number[] = [];
    w.addEventListener('click', () => { order.push(1); return true; });
    w.addEventListener('click', () => { order.push(2); });
    w.onclick();
    expect(order).toEqual([1]);
  });

  it('removeEventListener removes a specific handler', () => {
    const w = make();
    let calls = 0;
    const handler = () => { calls++; };
    w.addEventListener('click', handler);
    w.removeEventListener('click', handler);
    w.onclick();
    expect(calls).toBe(0);
  });

  it('removeEventListener on an object with no listeners does not throw (regression)', () => {
    const fresh = make();
    expect(() => fresh.removeEventListener('click', () => {})).not.toThrow();
  });

  it('a space-separated name registers the handler on each event', () => {
    const w = make();
    let calls = 0;
    w.addEventListener('click hover', () => { calls++; });
    w.onclick();
    w.onhover();
    expect(calls).toBe(2);
  });

  it('firing an event with no listeners is a no-op', () => {
    const w = make();
    expect(() => w.onhover()).not.toThrow();
  });
});
