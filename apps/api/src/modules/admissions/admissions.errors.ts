export class ApplicationNotFoundError extends Error {
  constructor() {
    super("Application not found");
  }
}

export class ApplicationAlreadyProcessedError extends Error {
  constructor(status: string) {
    super(`Application already ${status}`);
  }
}
