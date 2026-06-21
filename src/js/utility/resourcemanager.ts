import { EventDispatcher } from "./event";

export const ResourceTypes = {
  Binary: "arraybuffer",
  Text: "text",
  Image: "image",
  JSON: "json",
};

export class ResourceManager {
  loadingQueue: any[];
  loadingSessionId: number;
  loadingQueueCount: { [id: number]: number };
  loadingQueueLength: { [id: number]: number };
  loadingQueueFinish: { [id: number]: () => void };
  resources: { [url: string]: any };
  onprogress: (p: number) => void;
  finished?: boolean;

  constructor() {
    this.loadingQueue = [];
    this.loadingSessionId = 1;
    this.loadingQueueCount = {};
    this.loadingQueueLength = {};
    this.loadingQueueFinish = {};
    this.resources = {};
    this.onprogress = function (p: number) { };
  }

  add(url: string | any[], type?: string, onload?: (...args: any[]) => void, onprogress?: (e: any) => void): void {

    if (typeof url === "string") {
      // single resource
      if (typeof type === "undefined") {
        type = ResourceTypes.Binary;
      }

      this.addSingleResource(url, type, onload, onprogress);
    }
    else if (url instanceof Array) {
      const resArray = url;

      // multiple resource
      for (let i = 0; i < resArray.length; i += 2) {
        this.addSingleResource(resArray[i], resArray[i + 1]);
      }
    }
  }

  addSingleResource(url: string, type: string, onload?: (...args: any[]) => void, onprogress?: (e: any) => void): void {
    const res: any = { url, type, "data": null, "sessionId": this.loadingSessionId };
    const self = this;

    res.onload = function (this: any) {
      try {
        if (typeof onload === "function") {
          onload.apply(this, arguments as any);
        }
      } finally {
        if (--self.loadingQueueCount[this.sessionId] <= 0) {
          self.loadingQueueFinish[this.sessionId]();
        }
        self.progress(this.sessionId);
      }
    };

    if (typeof onprogress !== "undefined") {
      res.onprogress = onprogress;
    }

    this.loadingQueue.push(res);
  }

  get(url: string): any {
    const res = this.resources[url];
    if (!res) {
      console.error('resource not managed: ' + url);
      return;
    } else {
      return res.data;
    }
  }

  progress(sessionId: number): void {
    const p = this.loadingQueueCount[sessionId] / this.loadingQueueLength[sessionId];

    const round = function (val: number, precision: number) {
      const digit = Math.pow(10, precision);
      val = val * digit;
      val = Math.round(val);
      val = val / digit;
      return val;
    };

    this.onprogress(round((1 - p), 3));
  }

  preload(url: string, type: string, data: any): void {
    const res = { url, type, data, sessionId: this.loadingSessionId };
    this.resources[url] = res;
  }

  load(onfinish?: () => void): void {
    if (typeof onfinish !== "function") {
      onfinish = function () { };
    }

    // start new loading session
    const self = this;
    this.finished = false;
    this.loadingQueueCount[this.loadingSessionId] = this.loadingQueue.length;
    this.loadingQueueLength[this.loadingSessionId] = this.loadingQueue.length;
    this.loadingQueueFinish[this.loadingSessionId] = onfinish;

    const max_connection = 400;

    const dl = function () {
      const res = self.loadingQueue.pop();
      if (!res) { return; }

      if (self.resources[res.url]) {
        res.data = self.resources[res.url].data;
      } else {
        self.resources[res.url] = res;
      }

      if (res.data != null) {
        res.onload(res.data);

        if (self.loadingQueue.length > 0) {
          dl();
        }
      } else {
        (function (res: any) {
          ResourceManager.download(res.url, res.type, function (data: any) {
            res.data = data;

            res.onload(data);

            if (self.loadingQueue.length > 0) {
              dl();
            }
          }, res.onprogress);
        })(res);
      }
    }

    const next = function () {
      const cnt = (self.loadingQueue.length > max_connection) ? max_connection : self.loadingQueue.length;
      for (let ii = 0; ii < cnt; ii++) {
        dl();
      }
    }

    if (this.loadingQueue.length <= 0) {
      onfinish();
    } else {
      next();
    }

    this.loadingSessionId++;
  }

  static download(url: string, type: string, onfinish?: (data: any) => void, onprogress?: (e: any) => void): void {
    try {
      // var max_retry = 3;
      // var can_retry = max_retry;

      (function () {
        // 	var callee = arguments.callee;
        // var retry = function(e) {
        // 	if( --can_retry > 0 ){
        // 		setTimeout(callee, 20);// Do retry
        // 	}else{
        // console.warn("download resource error: " + url);
        // onfinish(null);
        // }
        // };
        const done: (data: any) => void = (typeof onfinish === "function") ? onfinish : function () { };

        if (type === ResourceTypes.Image) {
          const image = new Image();
          //max_retry = can_retry = 0; //It's not possible to get the HTTP status of request

          // image.onerror = retry;
          // image.onabort = retry;

          image.onload = function () {
            // if( can_retry < max_retry ){
            // 	console.log("recovery: " + url);
            // }
            done(image);
          };

          try {
            if ((new URL(url)).origin !== window.location.origin) {
              image.crossOrigin = "anonymous";
            }
          } catch (e) { }

          image.src = url;
        } else {

          const request = new XMLHttpRequest();
          request.open("GET", url, true);
          request.responseType = type as XMLHttpRequestResponseType;
          request.timeout = 500000;

          // request.onerror = retry;
          // request.onabort = retry;

          if (typeof onprogress === "function") {
            request.onprogress = onprogress;
          }

          request.onload = function (oEvent) {
            if (request.status == 404) {
              console.warn("resource not found: " + url);
              done(null);
            } else {
              let buffer = request.response;
              const result = (typeof buffer !== "undefined" && buffer != null) ? buffer : null;

              // if( can_retry < max_retry ){
              // 	console.log("recovery: " + url);
              // }

              // for some browsers, like IE11, they don't parse JSON format from downloaded
              // stream automatically. we parse it manually.
              if ((type == "json" || type == "JSON") && typeof buffer === "string") {
                try {
                  buffer = JSON.parse(buffer);
                } catch (e) {
                  console.warn("parse downloaded json error: " + url);
                }
              }

              done(buffer);
            }
            request.abort();

            // cannot delete local variable
            // delete request;
          };

          request.send(null);

        }
      })();
    }
    catch (e) {
      console.warn(e);
    }
  }
}
