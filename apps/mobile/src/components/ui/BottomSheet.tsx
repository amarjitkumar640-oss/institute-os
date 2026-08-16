import React, { useEffect, useRef, useState } from "react";
import {
  Animated, Modal, StyleSheet, TouchableOpacity, View,
} from "react-native";
import { ms } from "../../utils/responsive";
import { C } from "../../theme";

// Three intentional height tiers instead of every sheet picking its own number —
// "short" for a handful of fields/a single action, "standard" for most pickers and
// forms (the default), "tall" for dense grids/lists that benefit from showing more
// before the user has to scroll.
export const SHEET_HEIGHT = {
  short:    "65%",
  standard: "85%",
  tall:     "92%",
} as const;

interface Props {
  visible:    boolean;
  onClose:    () => void;
  children:   React.ReactNode;
  maxHeight?: number | `${number}%`;
}

export function BottomSheet({ visible, onClose, children, maxHeight = SHEET_HEIGHT.standard }: Props) {
  const [show, setShow] = useState(false);

  const translateY = useRef(new Animated.Value(700)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Reset to offscreen before mounting so there's no flash
      translateY.setValue(700);
      opacity.setValue(0);
      setShow(true);

      // One-frame delay so Modal has finished mounting before we animate
      const t = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1, duration: 240, useNativeDriver: true,
          }),
          Animated.spring(translateY, {
            toValue: 0, tension: 65, friction: 11, useNativeDriver: true,
          }),
        ]).start();
      }, 16);
      return () => clearTimeout(t);
    } else {
      // Animate out, then unmount
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0, duration: 200, useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 700, duration: 220, useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setShow(false);
      });
    }
  }, [visible]);

  if (!show && !visible) return null;

  return (
    <Modal
      visible={show}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Animated backdrop — tap to dismiss */}
      <Animated.View style={[s.backdrop, { opacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      {/* Spring-animated sheet container */}
      <View style={s.anchor} pointerEvents="box-none">
        <Animated.View style={[s.sheet, { maxHeight, transform: [{ translateY }] }]}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(14,6,10,0.52)",
  },
  anchor: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor:      C.card,
    borderTopLeftRadius:  ms(22),
    borderTopRightRadius: ms(22),
    overflow:             "hidden",
  },
});
