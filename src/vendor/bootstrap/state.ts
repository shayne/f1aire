let isInteractive = Boolean(process.stdout.isTTY);
let lastInteractionTime = Date.now();
let lastScrollActivity = 0;

export function updateLastInteractionTime(): void {
  lastInteractionTime = Date.now();
}

export function flushInteractionTime(): number {
  return lastInteractionTime;
}

export function markScrollActivity(): void {
  lastScrollActivity = Date.now();
}

export function getLastScrollActivity(): number {
  return lastScrollActivity;
}

export function getIsInteractive(): boolean {
  return isInteractive;
}

export function setIsInteractive(value: boolean): void {
  isInteractive = value;
}
