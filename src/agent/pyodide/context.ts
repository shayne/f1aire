export type PythonContext = {
  vars?: Record<string, unknown>;
};

export function buildPythonContext({
  vars,
}: {
  vars?: Record<string, unknown>;
}): PythonContext {
  return { vars };
}
