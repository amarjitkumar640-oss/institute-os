import { useEffect, useRef } from "react";
import { Keyboard, Platform, type NativeSyntheticEvent, type NativeScrollEvent, ScrollView } from "react-native";
import { ms } from "../utils/responsive";

interface Options {
  // Fixed pixel height of the scrollable container's own viewport (a
  // BottomSheet's content sits at a fixed height even though the sheet
  // itself is capped with `maxHeight`, since flex:1 can't resolve against
  // an auto-height parent — see AddClassPeriodModal.tsx for the same fact
  // driving its own layout fix). Pass whatever height that fixed wrapper
  // uses, e.g. `SCREEN_H * 0.88`.
  sheetHeight: number;
  // Breathing room kept above the keyboard once a field is scrolled into
  // view, so the field isn't scrolled to sit flush against the keyboard's
  // top edge.
  extraOffset?: number;
}

// Generalizes the field-clearing scroll logic proven in ManageSlotModal.tsx
// into a reusable hook for any BottomSheet-hosted form: a capped-height sheet
// can't rely on KeyboardAvoidingView (it settles on a stale offset inside a
// Modal — see CenterManagementScreen.tsx), so instead this scrolls the
// sheet's own internal ScrollView so the focused field clears the keyboard,
// and restores the pre-keyboard scroll position once it closes.
export function useKeyboardScrollIntoView({ sheetHeight, extraOffset = ms(140) }: Options) {
  const scrollRef = useRef<ScrollView>(null);
  const kbHeightRef = useRef(0);
  const focusedKeyRef = useRef<string | null>(null);
  const currentScrollYRef = useRef(0);
  const preKeyboardScrollYRef = useRef(0);
  // The ScrollView doesn't always start at the very top of the sheet (a
  // handle/title row above it doesn't scroll) — captured via the
  // ScrollView's own onLayout `y`, its offset within the sheet's flex column.
  const headerHeightRef = useRef(0);
  const fieldY = useRef<Record<string, number>>({});

  function recordFieldY(key: string) {
    return (e: { nativeEvent: { layout: { y: number } } }) => {
      fieldY.current[key] = e.nativeEvent.layout.y;
    };
  }

  function scrollToClearKeyboard(key: string, kbH: number) {
    const y = fieldY.current[key];
    if (y === undefined) return;
    const visible = sheetHeight - kbH - headerHeightRef.current;
    const target = Math.max(0, y - visible + extraOffset);
    scrollRef.current?.scrollTo({ y: target, animated: true });
  }

  // Called from a field's onFocus. If the keyboard is already open
  // (switching between fields), scroll immediately using the height we
  // already know. Otherwise wait for the keyboard-show listener below to
  // fire and drive the scroll from there — that's the only place the real
  // height is guaranteed known, avoiding any race with a guessed delay.
  function scrollFieldIntoView(key: string) {
    if (kbHeightRef.current === 0) preKeyboardScrollYRef.current = currentScrollYRef.current;
    focusedKeyRef.current = key;
    if (kbHeightRef.current > 0) scrollToClearKeyboard(key, kbHeightRef.current);
  }

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s1 = Keyboard.addListener(showEvt, (e) => {
      kbHeightRef.current = e.endCoordinates.height;
      if (focusedKeyRef.current) scrollToClearKeyboard(focusedKeyRef.current, e.endCoordinates.height);
    });
    const s2 = Keyboard.addListener(hideEvt, () => {
      kbHeightRef.current = 0;
      focusedKeyRef.current = null;
      scrollRef.current?.scrollTo({ y: preKeyboardScrollYRef.current, animated: true });
    });
    return () => { s1.remove(); s2.remove(); };
  }, [sheetHeight]);

  function onScrollViewLayout(e: { nativeEvent: { layout: { y: number } } }) {
    headerHeightRef.current = e.nativeEvent.layout.y;
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    currentScrollYRef.current = e.nativeEvent.contentOffset.y;
  }

  return { scrollRef, recordFieldY, scrollFieldIntoView, onScrollViewLayout, onScroll };
}
