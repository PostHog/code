import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { TypedEventEmitter } from "../../utils/typed-event-emitter";
import type { AuthService } from "../auth/service";
import { UIServiceEvent, type UIServiceEvents } from "./schemas";

@injectable()
export class UIService extends TypedEventEmitter<UIServiceEvents> {
  constructor(
    @inject(MAIN_TOKENS.AuthService)
    private readonly authService: AuthService,
  ) {
    super();
  }

  openSettings(): void {
    this.emit(UIServiceEvent.OpenSettings, true);
  }

  newTask(): void {
    this.emit(UIServiceEvent.NewTask, true);
  }

  resetLayout(): void {
    this.emit(UIServiceEvent.ResetLayout, true);
  }

  clearStorage(): void {
    this.emit(UIServiceEvent.ClearStorage, true);
  }

  async invalidateToken(): Promise<void> {
    await this.authService.invalidateAccessTokenForTest();
    this.emit(UIServiceEvent.InvalidateToken, true);
  }
}
