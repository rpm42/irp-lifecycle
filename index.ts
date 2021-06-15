import { Subject, of, BehaviorSubject, throwError } from 'rxjs'
import { catchError, concatMap, delay, map, mergeMap, tap, withLatestFrom } from 'rxjs/operators'
import defer from 'lodash/defer'
import { tryCatch } from 'rxjs/internal/util/tryCatch'

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

  ok = true
  errorMessage = ''
  error(msg: string) {
    this.ok = false
    this.errorMessage = msg
  }

  complete() {
    if (this.completionStack.length < 1) return
    const completion = this.completionStack.pop()
    completion.complete()
    console.log('complete', this.completionStack.map(s => `compl-${s.value}`))
  }
}

enum A {
  ACTION_DO = 'ACTION_DO',
  ACTION_OK = 'ACTION_OK',
  ACTION_FAIL = 'ACTION_FAIL'
}

enum S {
  INITIAL = 'INITIAL',
  PENGING = 'PENGING',
  READY = 'READY'
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
    return of(irp).pipe(
      tap(irp => console.log('start io operation')),
      delay(2000),
      concatMap(irp => {
        console.log('--- throwError ---')
        return throwError(new Error('#### SOME EERROORR'))
      }),
      delay(2000),
      tap(irp => console.log('finish io operation')),
      catchError(e => {
        console.log('catchError', e)
        irp.error(e.message)
        return of(irp)
      })
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
  state$ = new BehaviorSubject<S>(S.INITIAL)
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
    this.action$.next({ type: A.ACTION_DO, data: irp })
    console.log('syscall waiting for irp')
    await completion
    console.log('complete syscall')
    if (!irp.ok) throw new Error(irp.errorMessage)
    return 'OK'
  }

  dispatch = (a: Action, s: S) => {
    console.log('>>> dispatch', a.type, s)
    switch (a.type) {
      case A.ACTION_DO:
        console.log('state 1')
        defer(async () => {
          const irp = a.data
          console.log('enter defferedProcedureCall')
          const completion = irp.pushCompletion()
          this.irpNext$.next(irp)
          console.log('start waiting...')
          await completion
          console.log('stop waiting... continue...')
          if (irp.ok) {
            this.action$.next({ type: A.ACTION_OK, data: new Irp() })
          } else {
            console.log('irp fail with msg', irp.errorMessage)
            this.action$.next({ type: A.ACTION_FAIL, data: new Irp() })
          }
          console.log('deffered end')
          irp.complete()
        })
        console.log('post')
        return S.PENGING
      case A.ACTION_OK:
        console.log('state ok')
        return S.READY
      case A.ACTION_FAIL:
        console.log('state fail')
        return S.READY
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

async function main() {
  try {
    await d.syscall()
    console.log('OK')
  } catch (e) {
    console.error('ERROR', e.message)
  }
}

main()
