import "./runtimeActivity.css";

import * as DataStore from "@api/DataStore";
import ErrorBoundary from "@components/ErrorBoundary";
import { classNameFactory } from "@utils/css";
import { createRoot, React } from "@webpack/common";

const cl = classNameFactory("vc-kamidere-runtime-");

const HUD_PREFS_KEY = "kamidere-runtime-activity:v1";
const TASKS_PER_PAGE = 3;
const DOCKED_LAUNCHER = {
    x: 48,
    y: 8,
    size: 22,
};

export type KamidereRuntimeTaskStatus = "running" | "completed" | "cancelled" | "failed";

export interface KamidereRuntimeTask {
    id: string;
    toolId: string;
    name: string;
    status: KamidereRuntimeTaskStatus;
    subtitle?: string;
    detail?: string;
    progressCurrent?: number;
    progressTotal?: number | null;
    startedAt: number;
    updatedAt: number;
}

interface RuntimeHudPrefs {
    x: number;
    y: number;
    width: number;
    hidden: boolean;
    page: number;
}

const DEFAULT_PREFS: RuntimeHudPrefs = {
    x: 24,
    y: 88,
    width: 318,
    hidden: false,
    page: 0,
};

type RuntimeHudSnapshot = {
    tasks: KamidereRuntimeTask[];
    prefs: RuntimeHudPrefs;
};

interface HudMorphState {
    mode: "collapse" | "expand";
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    fromWidth: number;
    toWidth: number;
    fromHeight: number;
    toHeight: number;
    active: boolean;
}

const taskMap = new Map<string, KamidereRuntimeTask>();
const listeners = new Set<() => void>();
let prefs = { ...DEFAULT_PREFS };
let prefsLoaded = false;
let mountNode: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let mountUsers = 0;

function clampWidth(width: number) {
    return Math.max(220, Math.min(420, width));
}

function getSortedTasks() {
    return Array.from(taskMap.values()).sort((left, right) => left.startedAt - right.startedAt || left.id.localeCompare(right.id));
}

function getMaxPage(taskCount: number) {
    return Math.max(0, Math.ceil(taskCount / TASKS_PER_PAGE) - 1);
}

function getSnapshot(): RuntimeHudSnapshot {
    const tasks = getSortedTasks();
    const maxPage = getMaxPage(tasks.length);
    if (prefs.page > maxPage) {
        prefs = { ...prefs, page: maxPage };
    }

    return {
        tasks,
        prefs,
    };
}

function notify() {
    listeners.forEach(listener => listener());
}

async function loadPrefs() {
    if (prefsLoaded) return;
    prefsLoaded = true;

    const stored = await DataStore.get(HUD_PREFS_KEY) as Partial<RuntimeHudPrefs> | undefined;
    if (!stored) {
        notify();
        return;
    }

    prefs = {
        x: typeof stored.x === "number" ? stored.x : DEFAULT_PREFS.x,
        y: typeof stored.y === "number" ? stored.y : DEFAULT_PREFS.y,
        width: clampWidth(typeof stored.width === "number" ? stored.width : DEFAULT_PREFS.width),
        hidden: Boolean(stored.hidden),
        page: typeof stored.page === "number" ? stored.page : DEFAULT_PREFS.page,
    };

    notify();
}

function persistPrefs() {
    void DataStore.set(HUD_PREFS_KEY, prefs);
}

export function subscribeKamidereRuntimeActivity(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function upsertKamidereRuntimeTask(task: Omit<KamidereRuntimeTask, "updatedAt"> & { updatedAt?: number; }) {
    taskMap.set(task.id, {
        ...task,
        updatedAt: task.updatedAt ?? Date.now(),
    });
    notify();
}

export function removeKamidereRuntimeTask(taskId: string) {
    if (!taskMap.delete(taskId)) return;
    notify();
}

export function setKamidereRuntimeHudPrefs(next: Partial<RuntimeHudPrefs>) {
    prefs = {
        ...prefs,
        ...next,
        width: clampWidth(next.width ?? prefs.width),
    };
    persistPrefs();
    notify();
}

export function mountKamidereRuntimeActivity() {
    if (typeof document === "undefined") return;
    const { body } = document;
    if (!body) return;

    mountUsers += 1;
    void loadPrefs();

    if (root) {
        if (mountNode && !mountNode.isConnected) body.appendChild(mountNode);
        return;
    }

    if (!mountNode) {
        mountNode = document.createElement("div");
        mountNode.id = "vc-kamidere-runtime-hud-root";
    }
    if (!mountNode.isConnected) body.appendChild(mountNode);

    root = createRoot(mountNode);
    root.render(
        <div className={cl("hud-root")}>
            <ErrorBoundary noop>
                <KamidereRuntimeHud />
            </ErrorBoundary>
        </div>,
    );
}

export function unmountKamidereRuntimeActivity() {
    mountUsers = Math.max(0, mountUsers - 1);
    if (mountUsers > 0) return;

    root?.unmount();
    root = null;
    mountNode?.remove();
    mountNode = null;
}

export function useKamidereRuntimeActivity() {
    const [signal, forceUpdate] = React.useReducer(value => value + 1, 0);

    React.useEffect(() => {
        const unsubscribe = subscribeKamidereRuntimeActivity(forceUpdate);
        void loadPrefs();
        return unsubscribe;
    }, []);

    return React.useMemo(() => getSnapshot(), [signal]);
}

function TaskCard({ task }: { task: KamidereRuntimeTask; }) {
    const isRunning = task.status === "running";
    const progressPercent = task.progressTotal && task.progressTotal > 0 && task.progressCurrent != null
        ? Math.min(100, Math.max(0, Math.round((task.progressCurrent / task.progressTotal) * 100)))
        : null;
    const progressLabel = task.progressCurrent != null
        ? `${task.progressCurrent}/${task.progressTotal ?? "?"}`
        : task.detail ?? "Live";

    return (
        <div className={cl("task", "task-enter")}>
            <div className={cl("task-main")}>
                <div className={cl("task-spinner")} aria-hidden={!isRunning} />
                <div className={cl("task-copy")}>
                    <div className={cl("task-title-row")}>
                        <div className={cl("task-name")}>{task.name}</div>
                        <div className={cl("task-count")}>{progressLabel}</div>
                    </div>
                    <div className={cl("task-detail")}>{task.subtitle ?? task.detail ?? (isRunning ? "Running" : task.status)}</div>
                </div>
            </div>

            <div className={cl("task-progress-track")}>
                <div
                    className={cl("task-progress-fill")}
                    style={{ width: `${progressPercent ?? 22}%` }}
                />
            </div>
        </div>
    );
}

function CloseIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"
            />
        </svg>
    );
}

function ChevronIcon({ direction }: { direction: "left" | "right"; }) {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d={direction === "left"
                    ? "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                    : "M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"}
            />
        </svg>
    );
}

function LauncherIcon({ spinning = false }: { spinning?: boolean; }) {
    return (
        <span className={cl("launcher-icon", spinning && "launcher-icon-spinning")}>
            <span className={cl("launcher-icon-ring")} />
        </span>
    );
}

function KamidereRuntimeHud() {
    const { tasks, prefs: currentPrefs } = useKamidereRuntimeActivity();
    const [dragging, setDragging] = React.useState(false);
    const [resizing, setResizing] = React.useState(false);
    const [draftPrefs, setDraftPrefs] = React.useState(currentPrefs);
    const [morphState, setMorphState] = React.useState<HudMorphState | null>(null);
    const dragStartRef = React.useRef<{ pointerX: number; pointerY: number; x: number; y: number; width: number; } | null>(null);
    const draftPrefsRef = React.useRef(currentPrefs);
    const frameRef = React.useRef<number | null>(null);
    const hudRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        if (dragging || resizing) return;
        draftPrefsRef.current = currentPrefs;
        setDraftPrefs(currentPrefs);
    }, [currentPrefs, dragging, resizing]);

    React.useEffect(() => () => {
        if (frameRef.current !== null) {
            window.cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
    }, []);

    const pushDraftPrefs = React.useCallback((next: RuntimeHudPrefs) => {
        draftPrefsRef.current = next;

        if (frameRef.current !== null) return;

        frameRef.current = window.requestAnimationFrame(() => {
            frameRef.current = null;
            setDraftPrefs(draftPrefsRef.current);
        });
    }, []);

    React.useEffect(() => {
        if (!morphState?.active) return;

        const timeout = window.setTimeout(() => {
            if (morphState.mode === "collapse") {
                setKamidereRuntimeHudPrefs({ hidden: true });
            } else {
                setKamidereRuntimeHudPrefs({ hidden: false });
            }

            setMorphState(null);
        }, 170);

        return () => window.clearTimeout(timeout);
    }, [morphState]);

    React.useEffect(() => {
        if (!dragging && !resizing) return;

        const onPointerMove = (event: PointerEvent) => {
            const start = dragStartRef.current;
            if (!start) return;

            if (dragging) {
                pushDraftPrefs({
                    ...draftPrefsRef.current,
                    x: start.x + (event.clientX - start.pointerX),
                    y: start.y + (event.clientY - start.pointerY),
                });
                return;
            }

            if (resizing) {
                pushDraftPrefs({
                    ...draftPrefsRef.current,
                    width: clampWidth(start.width + (event.clientX - start.pointerX)),
                });
            }
        };

        const onPointerUp = () => {
            const nextPrefs = draftPrefsRef.current;
            setDragging(false);
            setResizing(false);
            dragStartRef.current = null;
            setKamidereRuntimeHudPrefs(nextPrefs);
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);

        return () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
        };
    }, [dragging, pushDraftPrefs, resizing]);

    const startDrag = (event: React.PointerEvent) => {
        event.preventDefault();
        dragStartRef.current = {
            pointerX: event.clientX,
            pointerY: event.clientY,
            x: currentPrefs.x,
            y: currentPrefs.y,
            width: currentPrefs.width,
        };
        draftPrefsRef.current = currentPrefs;
        setDraftPrefs(currentPrefs);
        setDragging(true);
    };

    const startResize = (event: React.PointerEvent) => {
        event.stopPropagation();
        event.preventDefault();
        dragStartRef.current = {
            pointerX: event.clientX,
            pointerY: event.clientY,
            x: currentPrefs.x,
            y: currentPrefs.y,
            width: currentPrefs.width,
        };
        draftPrefsRef.current = currentPrefs;
        setDraftPrefs(currentPrefs);
        setResizing(true);
    };

    const dockStyle = {
        transform: `translate3d(${DOCKED_LAUNCHER.x}px, ${DOCKED_LAUNCHER.y}px, 0)`,
        width: `${DOCKED_LAUNCHER.size}px`,
        height: `${DOCKED_LAUNCHER.size}px`,
    } as React.CSSProperties;

    if (tasks.length === 0) return null;

    const maxPage = getMaxPage(tasks.length);
    const page = Math.min(currentPrefs.page, maxPage);
    const offset = page * TASKS_PER_PAGE;
    const visibleTasks = tasks.slice(offset, offset + TASKS_PER_PAGE);
    const activePrefs = dragging || resizing ? draftPrefs : currentPrefs;
    const style = {
        transform: `translate3d(${activePrefs.x}px, ${activePrefs.y}px, 0)`,
        width: `${activePrefs.width}px`,
    } as React.CSSProperties;

    const startCollapse = () => {
        const rect = hudRef.current?.getBoundingClientRect();
        setMorphState({
            mode: "collapse",
            fromX: activePrefs.x,
            fromY: activePrefs.y,
            toX: DOCKED_LAUNCHER.x,
            toY: DOCKED_LAUNCHER.y,
            fromWidth: rect?.width ?? activePrefs.width,
            toWidth: DOCKED_LAUNCHER.size,
            fromHeight: rect?.height ?? 78,
            toHeight: DOCKED_LAUNCHER.size,
            active: false,
        });

        window.requestAnimationFrame(() => {
            setMorphState(current => current ? { ...current, active: true } : current);
        });
    };

    const startExpand = () => {
        const rect = hudRef.current?.getBoundingClientRect();
        setMorphState({
            mode: "expand",
            fromX: DOCKED_LAUNCHER.x,
            fromY: DOCKED_LAUNCHER.y,
            toX: currentPrefs.x,
            toY: currentPrefs.y,
            fromWidth: DOCKED_LAUNCHER.size,
            toWidth: currentPrefs.width,
            fromHeight: DOCKED_LAUNCHER.size,
            toHeight: rect?.height ?? 86,
            active: false,
        });

        window.requestAnimationFrame(() => {
            setMorphState(current => current ? { ...current, active: true } : current);
        });
    };

    if (activePrefs.hidden) {
        return (
            <>
                {!morphState && (
                    <button
                        type="button"
                        className={cl("launcher")}
                        style={dockStyle}
                        onClick={startExpand}
                        aria-label="Open Kamidere runtime tools"
                    >
                        <LauncherIcon spinning={tasks.some(task => task.status === "running")} />
                    </button>
                )}
                {morphState && (
                    <div
                        className={cl("morph-ghost", morphState.active && "morph-ghost-active")}
                        style={{
                            left: 0,
                            top: 0,
                            width: `${morphState.active ? morphState.toWidth : morphState.fromWidth}px`,
                            height: `${morphState.active ? morphState.toHeight : morphState.fromHeight}px`,
                            transform: `translate3d(${morphState.active ? morphState.toX : morphState.fromX}px, ${morphState.active ? morphState.toY : morphState.fromY}px, 0)`,
                        }}
                    />
                )}
            </>
        );
    }

    return (
        <>
            {morphState && (
                <div
                    className={cl("morph-ghost", morphState.active && "morph-ghost-active")}
                    style={{
                        left: 0,
                        top: 0,
                        width: `${morphState.active ? morphState.toWidth : morphState.fromWidth}px`,
                        height: `${morphState.active ? morphState.toHeight : morphState.fromHeight}px`,
                        transform: `translate3d(${morphState.active ? morphState.toX : morphState.fromX}px, ${morphState.active ? morphState.toY : morphState.fromY}px, 0)`,
                    }}
                />
            )}
        <div
            ref={hudRef}
            className={cl(
                "hud",
                (dragging || resizing) && "hud-interacting",
                morphState?.mode === "collapse" && "hud-collapsing",
            )}
            style={style}
        >
            <div
                className={cl("header", dragging && "header-dragging")}
                onPointerDown={startDrag}
            >
                <div className={cl("title-row")}>
                    <span className={cl("title-dot")} />
                    <div className={cl("title")}>Runtime</div>
                </div>

                <div className={cl("header-actions")}>
                    {tasks.length > TASKS_PER_PAGE && (
                        <>
                            <button
                                type="button"
                                className={cl("header-button")}
                                disabled={page <= 0}
                                onClick={event => {
                                    event.stopPropagation();
                                    setKamidereRuntimeHudPrefs({ page: Math.max(0, page - 1) });
                                }}
                                aria-label="Previous active tools"
                            >
                                <ChevronIcon direction="left" />
                            </button>
                            <button
                                type="button"
                                className={cl("header-button")}
                                disabled={page >= maxPage}
                                onClick={event => {
                                    event.stopPropagation();
                                    setKamidereRuntimeHudPrefs({ page: Math.min(maxPage, page + 1) });
                                }}
                                aria-label="Next active tools"
                            >
                                <ChevronIcon direction="right" />
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        className={cl("header-button")}
                        onClick={event => {
                            event.stopPropagation();
                            startCollapse();
                        }}
                        aria-label="Hide runtime tools"
                    >
                        <CloseIcon />
                    </button>
                </div>
            </div>

            <div className={cl("task-row")}>
                {visibleTasks.map(task => <TaskCard key={task.id} task={task} />)}
            </div>

            <div className={cl("resize-edge", "resize-edge-right")} onPointerDown={startResize} />
        </div>
        </>
    );
}

