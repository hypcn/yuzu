import { inspect } from "util";

export class ServerUiState<T extends object> {

  private _state: T;
  public get state() { return this._state; }
  public set state(s) {

    const proxyHandler: ProxyHandler<T> = {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);
        this.logGet(target, prop, value);
        return (typeof value === "object" && value !== null)
          ? new Proxy(value, proxyHandler)
          : value;
      },
      set: (target, prop, value, receiver) => {
        const currVal = (target as any)[prop];
        const success = Reflect.set(target, prop, value, receiver);
        // this._updated.next(this.doc);
        this.logChange(prop, currVal, value);
        return success;
      },
    };

    const proxyDoc = new Proxy(s, proxyHandler);
    this._state = proxyDoc;
  }

  constructor(initial: T, config?: {}) {
    // Just to appease the compiler
    this._state = initial;
    // Actually wire up the state
    this.state = initial;
  }

  logGet(target: object, prop: string | number | symbol, value: any) {
    const targ = inspect(target, { breakLength: undefined });
    const val = inspect(value, { breakLength: undefined });
    console.log(`GET ${targ}.${String(prop)} => ${val}`);
  }

  logChange(...data: any) {
    console.log("state changed:", data);
  }

}

const initialState = {
  aNumber: 4,
  aBool: true,
  aString: "howdy!",
  aList: [1, 2, 3, 4, 5],
  anObject: {
    a: 1,
    b: 2,
    c: 3,
  },
  aNestedObject: {
    name: "nest",
    one: {
      name: "one",
      two: {
        name: "two",
        three: [1, 2, 3],
      },
    },
  },
};

const svr = new ServerUiState(initialState);

svr.state.aBool = false;
svr.state.aString = "howdy doody neighbourino";
svr.state.aNumber = 27;
svr.state.aList.push(8, 9);
svr.state.aList = [5, 4, 3, 2, 1];
svr.state.aList.splice(3);
svr.state.anObject.c = 6;
