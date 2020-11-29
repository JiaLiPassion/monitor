// tslint:disable-next-line:no-reference
/// <reference path="../node_modules/zone.js/zone.d.ts"/>

import { ApplicationRef, Injector, NgModuleRef } from '@angular/core';
import { BehaviorSubject, Subject, Observable, of, combineLatest } from 'rxjs';
import { mergeMap, switchMap, tap, filter } from 'rxjs/operators';

interface TaskInfo {
  performanceStart?: number;
  performanceEnd?: number;
  performanceChildrenEnd?: number;
  taskStatus?: string;
}

interface TaskFrameChildrenUpdate {
  type: 'scheduled' | 'cancelled' | 'begin' | 'end';
  taskFrame: TaskFrame;
}

interface ChangeDetectionInfo {
  taskFrame: TaskFrame;
  duration: number;
  templateDuration: {
    component: any;
    duration: number;
  }[];
}

interface TaskFrame {
  parent?: TaskFrame;
  children?: TaskFrame[];
  task?: Task;
  invoked?: boolean;
  cancelled?: boolean;
  beginInvoke$: Subject<TaskFrame>;
  endInvoke$: Subject<TaskFrame>;
  childrenUpdated$: Subject<TaskFrameChildrenUpdate>;
  taskInfo?: TaskInfo;
  isBuilt?: boolean;
  changeDetectionInfos?: ChangeDetectionInfo[];
}

const topTaskFrame: TaskFrame = {
  children: [],
  beginInvoke$: new Subject<TaskFrame>(),
  endInvoke$: new Subject<TaskFrame>(),
  childrenUpdated$: new Subject<TaskFrameChildrenUpdate>(),
  changeDetectionInfos: [],
};

function printTick(tick: ChangeDetectionInfo) {
  console.log(
    `%cTicking cost ${tick.duration.toFixed(4)}ms because of:`,
    'color: orange; font-size: large'
  );
  if (currentTaskFrame.changeDetectionInfos.length > 1) {
    console.log(
      '%cOne task causes multiple tickings, try ngZoneEventCoalescing?',
      'color: red; font-size: large'
    );
  }
  if (tick.taskFrame) {
    printTaskFrame(tick.taskFrame);
  }
  tick.templateDuration.forEach((t) => {
    console.log(
      `%cComponent render ${
        t.component?.constructor?.name
      } cost ${t.duration.toFixed(4)} ms`,
      'color: orange'
    );
  });
}

function printTaskFrame(taskFrame: TaskFrame) {
  if (taskFrame === topTaskFrame) {
    console.log('%czone run on top', 'color: orange');
    return;
  }
  let tf = taskFrame;
  const logs: string[] = [];
  while (tf) {
    if (tf.task) {
      const callbackName =
        (tf.task.callback as any).displayName || tf.task.callback.name || '';
      const xhrInfo =
        tf.task.source === 'XMLHttpRequest.send'
          ? (tf.task.data as any).url
          : null;
      const taskInfo = xhrInfo || callbackName;
      logs.unshift(`task: ${tf.task.type}, ${tf.task.source}, ${taskInfo}`);
    }
    tf = tf.parent;
  }
  for (let i = 0; i < logs.length; i++) {
    let prefix = '';
    for (let j = 0; j < i; j++) {
      prefix += ' ';
    }
    console.log(`%c${prefix}${logs[i]}`, 'color: orange');
  }
}

let currentTaskFrame = topTaskFrame;
let currentTick: ChangeDetectionInfo;
let oldTaskFrame = null;
const taskFrameChanged$ = new BehaviorSubject<TaskFrame>(currentTaskFrame);
let ngZone: any;

function setCurrentTask(task: Task) {
  const taskInfo = Zone.current.get('taskInfo');
  taskInfo.currentTask = task;
}

const monitorZoneSpec: ZoneSpec = {
  name: 'monitor',
  properties: {
    taskInfo: {
      currentTask: null,
    },
  },
  onScheduleTask: (
    delegate: ZoneDelegate,
    curr: Zone,
    target: Zone,
    task: Task
  ) => {
    patchEventListener(task);
    const isXHR = task.source === 'XMLHttpRequest.send';
    const taskFrame = {
      parent: currentTaskFrame,
      children: [],
      task,
      beginInvoke$: isXHR
        ? new BehaviorSubject<TaskFrame>(this)
        : new Subject<TaskFrame>(),
      endInvoke$: new Subject<TaskFrame>(),
      childrenUpdated$: new Subject<TaskFrameChildrenUpdate>(),
      changeDetectionInfos: [],
    };
    currentTaskFrame.children.push(taskFrame);
    currentTaskFrame.childrenUpdated$.next({
      type: 'scheduled',
      taskFrame,
    });
    (task as any).taskFrame = taskFrame;
    if (task.source === 'XMLHttpRequest.send') {
      taskFrame.beginInvoke$.next(taskFrame);
    }
    return delegate.scheduleTask(target, task);
  },
  onCancelTask: (
    delegate: ZoneDelegate,
    curr: Zone,
    target: Zone,
    task: Task
  ) => {
    const taskFrame = (task as any).taskFrame as TaskFrame;
    if (taskFrame) {
      taskFrame.cancelled = true;
    }
    taskFrame.parent.childrenUpdated$.next({
      type: 'cancelled',
      taskFrame,
    });
    return delegate.cancelTask(target, task);
  },
  onInvokeTask: (
    delegate: ZoneDelegate,
    curr: Zone,
    target: Zone,
    task: Task,
    applyThis: any,
    applyArgs: any[]
  ) => {
    oldTaskFrame = currentTaskFrame;
    let taskFrame: TaskFrame;
    try {
      taskFrame = (task as any).taskFrame as TaskFrame;
      currentTaskFrame = taskFrame;
      if (task.type === 'eventTask') {
        taskFrameChanged$.next(currentTaskFrame);
      }
      if (task.source !== 'XMLHttpRequest.send') {
        taskFrame.beginInvoke$.next(taskFrame);
      }
      currentTaskFrame.parent.childrenUpdated$.next({
        type: 'begin',
        taskFrame,
      });
      setCurrentTask(task);
      return delegate.invokeTask(target, task, applyThis, applyArgs);
    } finally {
      setCurrentTask(null);
      if (
        ngZone &&
        ngZone._nesting - 1 == 0 &&
        !ngZone.hasPendingMicrotasks &&
        !ngZone.isStable
      ) {
      } else {
        currentTaskFrame = oldTaskFrame;
      }
      // taskFrameChanged$.next(currentTaskFrame);
      taskFrame.endInvoke$.next(taskFrame);
      if (taskFrame) {
        taskFrame.invoked = true;
        taskFrame.parent.childrenUpdated$.next({
          type: 'end',
          taskFrame,
        });
      }
    }
  },
  onInvoke: (
    delegate: ZoneDelegate,
    curr: Zone,
    target: Zone,
    callback: Function,
    applyThis: any,
    applyArgs: any[],
    source: string
  ) => {
    if (currentTaskFrame === topTaskFrame) {
      currentTaskFrame.beginInvoke$.next(currentTaskFrame);
    }
    try {
      return delegate.invoke(target, callback, applyThis, applyArgs, source);
    } finally {
      if (currentTaskFrame === topTaskFrame) {
        currentTaskFrame.endInvoke$.next(currentTaskFrame);
      }
    }
  },
};

function buildTask$(taskFrame: TaskFrame): Observable<TaskFrame> {
  taskFrame.isBuilt = true;
  const taskBegin$ = beginTask(taskFrame);
  const taskEnd$ = endTask(taskBegin$);
  const taskAllEnd$ = endAllTask(taskEnd$);
  return taskAllEnd$;
}

function beginTask(taskFrame: TaskFrame) {
  return taskFrame.beginInvoke$.pipe(
    tap((_) => {
      taskFrame.taskInfo = taskFrame.taskInfo || {};
      taskFrame.taskInfo.performanceStart = performance.now();
    })
  );
}

function endTask(taskBegin$: Observable<TaskFrame>) {
  return taskBegin$.pipe(
    switchMap((taskFrame) =>
      taskFrame.endInvoke$.pipe(
        tap((_) => {
          taskFrame.taskInfo.performanceEnd = performance.now();
        })
      )
    )
  );
}

function endAllTask(taskEnd$: Observable<TaskFrame>): Observable<TaskFrame> {
  return taskEnd$.pipe(
    switchMap((taskFrame) => {
      if (taskFrame.children.length === 0) {
        return of(taskFrame);
      }
      return combineLatest(
        taskFrame.children
          .filter(
            (childTaskFrame) =>
              childTaskFrame.task.type !== 'eventTask' &&
              !childTaskFrame.invoked &&
              !childTaskFrame.cancelled
          )
          .map((childTaskFrame) => {
            return buildTask$(childTaskFrame);
          })
      ).pipe(
        switchMap((_) => {
          taskFrame.taskInfo.performanceChildrenEnd = performance.now();
          return of(taskFrame);
        })
      );
    })
  );
}

declare let ng: any;
function patchComponent(tView, lView, component: any) {
  const templateFn = tView.template;
  const preOrderCheckHooks = tView.preOrderCheckHooks;
  const contentCheckHooks = tView.contentCheckHooks;
  const viewCheckHooks = tView.viewCheckHooks;
  if (viewCheckHooks) {
    // TODO: hard coding here for demo
    for (let i = 0; i < viewCheckHooks.length; i++) {
      const hook = viewCheckHooks[i];
      if (typeof hook !== 'function') {
        continue;
      }
      viewCheckHooks[i] = function (this: unknown) {
        const comp = this;
        const keys = Object.keys(comp);
        const beforeValues: any = {};
        keys.forEach((key) => {
          if (typeof comp[key] !== 'function') {
            beforeValues[key] = comp[key];
          }
        });
        const r = hook.apply(comp, arguments);
        keys.forEach((key) => {
          if (typeof comp[key] !== 'function') {
            const beforeValue = beforeValues[key];
            const afterValue = comp[key];
            if (afterValue !== beforeValue) {
              console.log(
                `%cValue is updated in the ${component.constructor?.name} ${hook.name} from '${beforeValue}' to '${afterValue}'`,
                'color: red; font-size: large'
              );
            }
          }
        });
        return r;
      };
    }
  }
  const components = tView.components;
  if (templateFn && !templateFn['__monitor_unpatched__']) {
    tView.template = function (this: unknown) {
      const start = performance.now();
      const r = templateFn.apply(this, arguments);
      const duration = performance.now() - start;
      if (currentTick) {
        currentTick.templateDuration.push({
          component,
          duration,
        });
      }
      return r;
    };
    tView.template['__monitor_unpatched__'] = templateFn;
  }
  if (!components) {
    return;
  }
  components.forEach((c) => {
    const slot = lView[c];
    let cLView;
    if (Array.isArray(slot) && typeof slot[1] === 'object') {
      cLView = slot;
    } else {
      cLView = slot[0];
    }
    patchComponent(cLView[1], cLView, cLView[8]);
  });
}

function patchEventListener(task: Task) {
  if (task.type !== 'eventTask' || task.callback.name) {
    return;
  }
  const unWrap = task.callback('__ngUnwrap__');
  if (!unWrap) {
    return;
  }
  const unWrapAgain = unWrap(Function);
  if (!unWrapAgain) {
    (task.callback as any).displayName = unWrap.name;
    (task.callback as any).unWrap = unWrap;
    return;
  }
  (task.callback as any).displayName = unWrapAgain.name;
  (task.callback as any).unWrap = unWrapAgain;
}

function printTaskFrameLogAndCleanup(taskFrame: TaskFrame) {
  if (!taskFrame.taskInfo) {
    return;
  }
  if (!taskFrame.task) {
    console.log(
      'cost time: ',
      (
        (taskFrame.taskInfo.performanceChildrenEnd ||
          taskFrame.taskInfo.performanceEnd) -
        taskFrame.taskInfo.performanceStart
      ).toFixed(4),
      'ms'
    );
    console.log('zone run are done');
    return;
  }
  console.group();
  console.log(
    'all children tasks are done',
    taskFrame.task.type,
    taskFrame.task.source
  );
  console.log(
    'cost time: ',
    (
      (taskFrame.taskInfo.performanceChildrenEnd ||
        taskFrame.taskInfo.performanceEnd) - taskFrame.taskInfo.performanceStart
    ).toFixed(4),
    'ms'
  );
  taskFrame.children.forEach((c) => {
    printTaskFrameLogAndCleanup(c);
  });
  console.groupEnd();
  // taskFrame.taskInfo = {};
  taskFrame.children = [];
}

export function initMonitorZone(
  callback: () => Promise<NgModuleRef<any>>,
  rootElement: Element
) {
  taskFrameChanged$
    .pipe(
      filter((taskFrame) => !taskFrame.isBuilt),
      mergeMap((taskFrame) => {
        const taskAllEnd$ = buildTask$(taskFrame);
        return taskAllEnd$.pipe(
          tap((_) => {
            printTaskFrameLogAndCleanup(taskFrame);
          })
        );
      })
    )
    .subscribe();
  Zone.current.fork(monitorZoneSpec).run(() => {
    callback()
      .then((ngModuleRef) => {
        const appRef = ngModuleRef.injector.get(ApplicationRef);
        const rootComponents = ng && ng.getRootComponents(rootElement);
        rootComponents.forEach((r) => {
          const lView = r['__ngContext__'];
          const tView = lView[1];
          patchComponent(tView, lView, r);
        });
        const tick$ = new Subject<any>();
        const tick = appRef.tick;
        ngZone = (appRef as any)._zone;
        appRef.tick = function (this: unknown) {
          const start = performance.now();
          currentTick = {
            taskFrame: currentTaskFrame,
            duration: 0,
            templateDuration: [],
          };
          let r = null;
          try {
            r = tick.apply(this, arguments);
          } catch (err) {
            console.error(err);
          }
          const end = performance.now();
          currentTick.duration = end - start;
          tick$.next(currentTick);
          // TODO: try to patch embemded view later
          // rootComponents.forEach((r) => {
          //   const lView = r['__ngContext__'];
          //   const tView = lView[1];
          //   patchComponent(tView, lView, r);
          // });
          return r;
        };
        tick$
          .pipe(
            tap((currentTick) => {
              currentTaskFrame.changeDetectionInfos.push(currentTick);
              printTick(currentTick);
              if (oldTaskFrame) {
                currentTaskFrame = oldTaskFrame;
              }
            })
          )
          .subscribe();
      })
      .catch((err) => console.log);
  });
}
