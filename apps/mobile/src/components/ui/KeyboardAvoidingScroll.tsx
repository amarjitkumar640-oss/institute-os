import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  KeyboardAvoidingView, Keyboard, Platform, ScrollView, StyleSheet,
  type ScrollViewProps,
} from "react-native";

interface Props extends ScrollViewProps {
  children: React.ReactNode;
  // Content pinned below the scroll area (e.g. a persistent submit button)
  // that still sits inside the KeyboardAvoidingView, so it lifts with the
  // keyboard instead of getting covered by it.
  footer?: React.ReactNode;
}

// Drop-in replacement for a form's own KeyboardAvoidingView+ScrollView pair —
// scrolls the focused field above the keyboard as the user types (iOS
// "padding" behavior; Android relies on windowSoftInputMode) and, critically,
// scrolls back to the top once the keyboard closes. Plain KeyboardAvoidingView
// never reverses its own auto-scroll on its own, so every full-screen form in
// this app previously hand-rolled the same `Keyboard.addListener("keyboardDidHide", ...)`
// reset — this centralizes that one recipe instead of re-copying it per screen.
export const KeyboardAvoidingScroll = forwardRef<ScrollView, Props>(function KeyboardAvoidingScroll(
  {
    children, footer, style, contentContainerStyle,
    keyboardShouldPersistTaps = "handled",
    showsVerticalScrollIndicator = false,
    ...rest
  },
  forwardedRef,
) {
  const scrollRef = useRef<ScrollView>(null);
  useImperativeHandle(forwardedRef, () => scrollRef.current as ScrollView);

  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidHide", () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return () => sub.remove();
  }, []);

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        ref={scrollRef}
        style={[s.flex, style]}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        {...rest}
      >
        {children}
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  );
});

const s = StyleSheet.create({ flex: { flex: 1 } });
