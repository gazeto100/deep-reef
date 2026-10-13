/**
 * The player's "hurry" presses during a presentation. Each press ends the step that is
 * running at that moment: while the reels spin it slams them, while wins are shown it
 * skips them. A press when no step is listening is ignored, so a single press never
 * skips two things at once.
 */
export class Hurry {
  private readonly listeners = new Set<() => void>();

  press(): void {
    const current = [...this.listeners];
    this.listeners.clear();
    for (const listener of current) listener();
  }

  /** Resolves after `ms`, or earlier with 'hurried' if the player presses. */
  wait(ms: number): Promise<'done' | 'hurried'> {
    return new Promise((resolve) => {
      const onPress = (): void => {
        clearTimeout(timer);
        resolve('hurried');
      };
      const timer = setTimeout(() => {
        this.listeners.delete(onPress);
        resolve('done');
      }, ms);
      this.listeners.add(onPress);
    });
  }

  /** Runs `onPress` once if the player presses before `until` settles. */
  during<T>(until: Promise<T>, onPress: () => void): Promise<T> {
    this.listeners.add(onPress);
    return until.finally(() => this.listeners.delete(onPress));
  }
}
