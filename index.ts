import { Subject, of, BehaviorSubject } from 'rxjs'
import { concatMap, delay, map, mergeMap, tap, withLatestFrom } from 'rxjs/operators'
import defer from 'lodash/defer'

type Completion = BehaviorSubject<number>

const createCompletion = () => new BehaviorSubject<number>(getUniqId())

function* GetUniqId(): Generator<number, number, number> {
  var index = 1
  while (true) yield index++
}

const gen = GetUniqId()

export default function getUniqId() {
  return gen.next().value
}

class Irp {
  completionStack: Completion[] = []
  pushCompletion(completion: Completion = createCompletion()) {
    this.completionStack.push(completion)
    console.log('pushCompletion', this.completionStack.map(s => `compl-${s.value}`))
    return completion.toPromise()
  }

  // get completion() {
  //   const value = this.completionStack[this.completionStack.length - 1]
  //   console.log(`[get completion] comp-${value.value}`)
  //   return value.toPromise()
  // }

  close = false

  complete() {
    if (this.completionStack.length < 1) return
    const completion = this.completionStack.pop()
    completion.complete()
    console.log('complete', this.completionStack.map(s => `compl-${s.value}`))
  }
}

enum A {
  ACTION_1 = 'ACTION_1',
  ACTION_2 = 'ACTION_2'
}

enum S {
  STATE_1 = 'STATE_1',
  STATE_2 = 'STATE_2',
  STATE_3 = 'STATE_3'
}

interface Action {
  type: A
  data: Irp
}

const defferedProcedureCall = (fn: () => void) => setTimeout(fn, 0)

class Port {
  dispatch = (irp: Irp) => {
    return of(irp).pipe(
      tap(irp => console.log('start io operation')),
      delay(5000),
      tap(irp => console.log('finish io operation'))
    )
  }

  irpIn$ = new Subject<Irp>()
  irpOut$ = this.irpIn$.pipe(mergeMap(this.dispatch))

  constructor(next$: Subject<Irp>, back$: Subject<Irp>) {
    next$.subscribe(this.irpIn$)
    this.irpOut$.subscribe(back$)
  }
}

class Dispatcher {
  state$ = new BehaviorSubject<S>(S.STATE_1)
  action$ = new Subject<Action>()
  irpNext$ = new Subject<Irp>()
  irpBack$ = new Subject<Irp>()
  port = new Port(this.irpNext$, this.irpBack$)

  get state() {
    return this.state$.value
  }

  syscall = async () => {
    console.log('start syscall')
    const irp = new Irp()
    const completion = irp.pushCompletion()
    console.log('syscall queue irp')
    this.action$.next({ type: A.ACTION_1, data: irp })
    console.log('syscall waiting for irp')
    await completion
    console.log('complete syscall')
  }

  dispatch = (a: Action, s: S) => {
    console.log('>>> dispatch', a.type, s)
    switch (a.type) {
      case A.ACTION_1:
        console.log('state 1')
        defer(async () => {
          console.log('enter defferedProcedureCall')
          const completion = a.data.pushCompletion()
          this.irpNext$.next(a.data)
          console.log('start waiting...')
          await completion
          console.log('stop waiting... continue...')
          this.action$.next({ type: A.ACTION_2, data: new Irp() })
          console.log('deffered end')
          a.data.complete()
        })
        console.log('post')
        return S.STATE_2
      case A.ACTION_2:
        console.log('state 2')
        return S.STATE_3
    }
    return this.state
  }

  constructor() {
    this.irpBack$.subscribe(irp => irp.complete())
    this.action$
      .pipe(
        withLatestFrom(this.state$),
        concatMap(([a, s]) => of(this.dispatch(a, s))),
        tap(s => console.log('!!! change state', s))
      )
      .subscribe(this.state$)
  }
}

const d = new Dispatcher()
d.syscall()
