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
