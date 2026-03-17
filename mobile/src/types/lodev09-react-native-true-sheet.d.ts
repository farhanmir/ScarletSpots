declare module "@lodev09/react-native-true-sheet" {
  import * as React from "react";

  export type TrueSheetDetent = "auto" | number;

  export interface TrueSheetProps {
    children?: React.ReactNode;
    detents?: TrueSheetDetent[];
    onDidPresent?: () => void;
    onDidDismiss?: () => void;
  }

  export interface TrueSheetRef {
    present: (detentIndex?: number, animated?: boolean) => Promise<void>;
    dismiss: (animated?: boolean) => Promise<void>;
  }

  export const TrueSheet: React.ForwardRefExoticComponent<
    TrueSheetProps & React.RefAttributes<TrueSheetRef>
  >;
}
