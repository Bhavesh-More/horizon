declare module "node-cron" {
  export interface ScheduledTask {
    start(): this;
    stop(): this;
    destroy(): void;
    getStatus(): string;
  }

  export interface ScheduleOptions {
    scheduled?: boolean;
    timezone?: string;
  }

  export function schedule(
    cronExpression: string,
    func: () => void,
    options?: ScheduleOptions
  ): ScheduledTask;

  export function validate(cronExpression: string): boolean;
}
