import { NativeModule, requireNativeModule } from "expo";

declare class BankPushModule extends NativeModule {
  isEnabled(): boolean;
  openSettings(): void;
  /** JSON-масив подій { pkg, title, text, at, key }; черга очищається */
  drain(): string;
  simulate(pkg: string, title: string, text: string): void;
}

export default requireNativeModule<BankPushModule>("BankPush");
