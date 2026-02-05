export function buildPythonBridgePrelude() {
  return `import tool_bridge


def _reject_run_py(name):
    if name == "run_py":
        raise RuntimeError("run_py is not callable from Python")


def _normalize_args(args):
    return {} if args is None else args


def call_tool_async(name, args=None):
    _reject_run_py(name)
    return tool_bridge.callTool(name, _normalize_args(args))


try:
    from pyodide.ffi import run_sync, can_run_sync
except ImportError:
    run_sync = None
    can_run_sync = None


def call_tool(name, args=None):
    _reject_run_py(name)
    if run_sync is None:
        raise RuntimeError("pyodide.ffi.run_sync is unavailable; use call_tool_async")
    if can_run_sync is not None and not can_run_sync():
        raise RuntimeError("pyodide.ffi.run_sync is unavailable in this context; use call_tool_async")
    return run_sync(tool_bridge.callTool(name, _normalize_args(args)))
`;
}
