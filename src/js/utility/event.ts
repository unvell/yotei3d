
import { arrayRemove } from './utility';

export class EventDispatcher {
  owner: any;
  events: { [name: string]: any };

  constructor(cstor: any) {
    if (!cstor) {
      throw "Owner object to define events cannot be null or undefined";
    }

    this.owner = cstor;
    this.events = {};
  }

  registerEvents(...args: string[]): void {
    for (let i = 0; i < args.length; i++) {
      const eventName = args[i];
      this.events[eventName] = null;
      this.setupPrototypeEventDispatcher(this.owner, eventName);
    }
  }

  setupPrototypeEventDispatcher(cstor: any, name: string): void {
    const _this = this;

    const addEventListener = function (this: any, eventName: string, listener: any) {
      const obj = this;

      if (eventName.indexOf(" ") > 0) {
        const eventNames = eventName.split(" ");
        for (let i = 0; i < eventNames.length; i++) {
          _this.addEventListenerForObject(obj, eventNames[i], listener);
        }
      } else {
        _this.addEventListenerForObject(obj, eventName, listener);
      }

      return listener;
    };

    const proto = cstor.prototype;

    // addEventListener
    if (typeof proto.addEventListener !== "function") {
      proto.addEventListener = addEventListener;
    }

    if (typeof proto.on !== "function") {
      proto.on = proto.addEventListener;
    }

    // removeEventListener
    if (typeof proto.removeEventListener !== "function") {
      proto.removeEventListener = function (this: any, eventName: string, listener: any) {

        if (!this._eventListeners.hasOwnProperty(eventName)) {
          if (!(function () {
            if (eventName.startsWith("on")) {
              const eventNameWithoutOn = eventName.substr(2);

              if (_this.events.hasOwnProperty(eventNameWithoutOn)) {
                console.warn("recommended to remove 'on' prefix for removing event listener: " + eventName);
                eventName = eventNameWithoutOn;

                return true;
              }
            }

            return false;
          })()) {
            console.warn("listener to be removed from an event which does not exist: " + eventName);
            return;
          }
        }

        arrayRemove(this._eventListeners[eventName], listener);
      };
    }

    // define event property
    Object.defineProperty(proto, "on" + name, {
      get: function (this: any) {

        // raise event
        return function (this: any) {
          if (typeof this._eventListeners !== "object"
            || !this._eventListeners.hasOwnProperty(name)) {
            return;
          }

          const listenerList = this._eventListeners[name];

          let ret;

          for (let i = 0; i < listenerList.length; i++) {
            const listener = listenerList[i];
            ret = listener.apply(this, arguments);

            if (ret === true) {
              break;
            }
          }

          return ret;
        };
      },

      set: function (this: any, listener: any) {
        // if assign listener to an event, clear all current registered events
        if (typeof this._eventListeners === "undefined") {
          Object.defineProperty(this, "_eventListeners", {
            value: {},
            enumerable: false,
          });
        }

        this._eventListeners[name] = [listener];
      },

      enumerable: false,
    });
  }

  addEventListenerForObject(obj: any, eventName: string, listener: any): void {
    if (!this.events.hasOwnProperty(eventName)) {

      if (!(function (this: EventDispatcher) {
        if (eventName.startsWith("on")) {
          const eventNameWithoutOn = eventName.substr(2);

          if (this.events.hasOwnProperty(eventNameWithoutOn)) {
            console.warn("recommended to remove 'on' prefix for adding event listener: " + eventName);
            eventName = eventNameWithoutOn;

            return true;
          }
        }

        return false;
      }).call(this)) {
        console.warn("event to be listened does not exist: " + eventName);
        return;
      }
    }

    if (typeof obj._eventListeners === "undefined") {
      Object.defineProperty(obj, "_eventListeners", {
        value: {},
        enumerable: false,
      });
    }

    if (!obj._eventListeners.hasOwnProperty(eventName)) {
      obj._eventListeners[eventName] = [];
    }

    obj._eventListeners[eventName].push(listener);
  }
}
