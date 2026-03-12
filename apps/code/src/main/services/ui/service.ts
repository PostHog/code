import { injectable } from "inversify";
import { TypedEventEmitter } from "../../utils/typed-event-emitter";
import { UIServiceEvent, type UIServiceEvents } from "./schemas";

@injectable()
export class UIService extends TypedEventEmitter<UIServiceEvents> {
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

  invalidateToken(): void {
    this.emit(UIServiceEvent.InvalidateToken, true);
  }
}
