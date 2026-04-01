import useApp from '../vendor/ink/hooks/use-app.js';

export type UseStdoutResult = {
  stdout: NodeJS.WriteStream;
  write: (data: string) => void;
};

export function useStdout(): UseStdoutResult {
  const { stdout, write } = useApp();
  return { stdout, write };
}
