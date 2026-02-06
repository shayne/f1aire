export function buildPythonBridgePrelude() {
  return `import tool_bridge


_ASYNCIO_RUN_ERROR = (
    "asyncio.run() and loop.run_until_complete() are not supported in this Pyodide "
    "Node runtime (requires WebAssembly stack switching). Use top-level 'await' "
    "in run_py and await call_tool(...) instead."
)


def _reject_run_py(name):
    if name == "run_py":
        raise RuntimeError("run_py is not callable from Python")


def _normalize_args(args):
    return {} if args is None else args


async def call_tool_async(name, args=None):
    _reject_run_py(name)
    return await tool_bridge.callTool(name, _normalize_args(args))


async def call_tool(name, args=None):
    # call_tool is the preferred name, but it is async in this runtime.
    return await call_tool_async(name, args)


def call_tool_sync(name, args=None):
    raise RuntimeError(
        "Synchronous tool calls are not supported in this runtime. "
        "Use: result = await call_tool(name, args)"
    )


def _block_asyncio_run(*_args, **_kwargs):
    raise RuntimeError(_ASYNCIO_RUN_ERROR)


def __f1aire_to_jsonable(obj, _depth=0, _max_depth=6, _seen=None):
    # Convert common Python values into JSON-friendly structures so the JS bridge
    # can always return something, even when the user's code returns iterators
    # (range, generators) or other non-convertible objects.
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj

    if _seen is None:
        _seen = set()
    if _depth >= _max_depth:
        try:
            return repr(obj)
        except Exception:
            return str(obj)

    # Track recursion for non-primitive objects only.
    try:
        oid = id(obj)
        if oid in _seen:
            return '<cycle>'
        _seen.add(oid)
    except Exception:
        pass

    if isinstance(obj, (bytes, bytearray)):
        try:
            return obj.decode('utf-8')
        except Exception:
            return [b for b in obj]

    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            try:
                key = str(k)
            except Exception:
                key = repr(k)
            out[key] = __f1aire_to_jsonable(v, _depth + 1, _max_depth, _seen)
        return out

    if isinstance(obj, (list, tuple, set, frozenset, range)):
        return [__f1aire_to_jsonable(v, _depth + 1, _max_depth, _seen) for v in obj]

    try:
        from pyodide.ffi import JsProxy

        if isinstance(obj, JsProxy):
            # Prefer deep conversion if available.
            try:
                to_py = getattr(obj, 'to_py', None)
                if callable(to_py):
                    return __f1aire_to_jsonable(to_py(), _depth + 1, _max_depth, _seen)
            except Exception:
                pass
            # Fall back to best-effort representation.
            try:
                return repr(obj)
            except Exception:
                return str(obj)
    except Exception:
        pass

    try:
        d = getattr(obj, '__dict__', None)
        if isinstance(d, dict):
            return __f1aire_to_jsonable(d, _depth + 1, _max_depth, _seen)
    except Exception:
        pass

    try:
        return repr(obj)
    except Exception:
        return str(obj)


try:
    import asyncio

    asyncio.run = _block_asyncio_run
    try:
        asyncio.runners.Runner.run = _block_asyncio_run
    except Exception:
        pass
    try:
        asyncio.BaseEventLoop.run_until_complete = _block_asyncio_run
    except Exception:
        pass
except Exception:
    pass

try:
    import pyodide.webloop

    try:
        pyodide.webloop.WebLoop.run_until_complete = _block_asyncio_run
    except Exception:
        pass
except Exception:
    pass
`;
}
