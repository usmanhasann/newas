/**
 * Keeps a note box visible above the keyboard (client 10/14 p.6-7, first check-in):
 *  - when the keyboard opens, the box (label + text box) is centered in the space above it;
 *  - as the box grows with new lines, the screen scrolls just enough to keep it in view (past its
 *    max height the box scrolls inside itself and the phone keeps the typed line in view);
 *  - the user can scroll freely while typing (no automatic scroll while they drag), and the
 *    keyboard isn't closed by scrolling.
 * The screen keeps its size; the keyboard's covered part is measured and added as empty space under
 * the content (see keyboardScroll.ts for why). StepScaffold's `composer` mode renders the layout.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  type KeyboardEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type TextInput,
  type View,
} from 'react-native';
import {
  centeredScrollY,
  dockedKeyboardTop,
  followScrollY,
  keyboardOverlap,
  type KeyboardFrame,
} from './keyboardScroll';
import { measureInScrollContent, measureOnScreen } from './measure';

/** The refs StepScaffold's composer layout puts on its ScrollView. */
export interface ComposerRefs {
  scrollRef: RefObject<ScrollView | null>;
  /** The scroll view's content View (innerViewRef): the note box is measured against it. */
  contentRef: RefObject<View | null>;
}

/** What StepScaffold's composer layout wires onto its ScrollView (refs apart, in ComposerRefs). */
export interface ComposerScroll {
  /** The scroll view's height (the content column is at least this tall: footer at the bottom). */
  frameHeight: number;
  /** Empty space under the content, as tall as the part of the scroll view the keyboard covers. */
  keyboardSpace: number;
  onLayout: (e: LayoutChangeEvent) => void;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag: () => void;
  onScrollEndDrag: () => void;
  onMomentumScrollBegin: () => void;
  onMomentumScrollEnd: () => void;
  onContentSizeChange: (width: number, height: number) => void;
  onKeyboardSpaceLayout: (e: LayoutChangeEvent) => void;
}

/** How long our own animated scroll runs (its momentum events aren't the user's). */
const AUTO_SCROLL_MS = 400;

/** What the note box wires up: its wrapper View (label + box) and the TextInput's events. */
export interface ComposerNote {
  onBoxLayout: () => void;
  /** Call on every text change: typing brings the box back if the user had scrolled it away. */
  onTextChange: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

export function useKeyboardComposer({
  boxRef,
  inputRef,
}: {
  /** Wrapper View around the label + text box (collapsable={false}). */
  boxRef: RefObject<View | null>;
  inputRef: RefObject<TextInput | null>;
}): { refs: ComposerRefs; scroll: ComposerScroll; note: ComposerNote } {
  const scrollRef = useRef<ScrollView | null>(null);
  const contentRef = useRef<View | null>(null);
  const [frameHeight, setFrameHeight] = useState(0);
  const [keyboardSpace, setKeyboardSpace] = useState(0);
  // Latest values for the event handlers.
  const frame = useRef(0);
  const space = useRef(0);
  const scrollY = useRef(0);
  const focused = useRef(false);
  const dragging = useRef(false);
  const coasting = useRef(false);
  const autoScrollUntil = useRef(0);
  // The box has been centered for the keyboard that's open now (once per opening).
  const centered = useRef(false);

  const isFocused = useCallback(
    () => focused.current || inputRef.current?.isFocused?.() === true,
    [inputRef],
  );

  const scrollTo = useCallback((y: number) => {
    scrollY.current = y;
    autoScrollUntil.current = Date.now() + AUTO_SCROLL_MS;
    scrollRef.current?.scrollTo({ y, animated: true });
  }, []);

  const showBox = useCallback(
    async (mode: 'center' | 'follow') => {
      // Never fight the user's own scrolling (they can scroll freely while typing).
      if (dragging.current || coasting.current) return;
      const visible = frame.current - space.current;
      if (space.current <= 0 || visible <= 0) return;
      const box = await measureInScrollContent(boxRef.current, contentRef.current);
      if (!box) return;
      // Only now is this opening's centering done (a skipped one is retried by the next trigger).
      if (mode === 'center') centered.current = true;
      const at = { top: box.top, height: box.height, visible };
      const y = mode === 'center' ? centeredScrollY(at) : followScrollY({ ...at, scrollY: scrollY.current });
      if (y !== null && Math.abs(y - scrollY.current) > 1) scrollTo(y);
    },
    [boxRef, scrollTo],
  );

  // The keyboard's top edge → how much of the scroll view it covers.
  const applyKeyboard = useCallback(async (kb: KeyboardFrame | null | undefined) => {
    const top = dockedKeyboardTop(kb, Dimensions.get('window').height, Platform.OS);
    if (top === null) {
      centered.current = false;
      space.current = 0;
      setKeyboardSpace(0);
      return;
    }
    const view = await measureOnScreen(scrollRef.current?.getNativeScrollRef());
    if (!view) return;
    if (space.current === 0) {
      // A new opening: a drag the system cancelled (no end event) must not keep scrolling off.
      dragging.current = false;
      coasting.current = false;
    }
    const overlap = keyboardOverlap(view.pageY, view.height, top);
    space.current = overlap;
    setKeyboardSpace(overlap);
  }, []);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const onShow = (e: KeyboardEvent) => void applyKeyboard(e.endCoordinates);
    const onHide = () => void applyKeyboard(null);
    // iOS: "will" events move with the keyboard; didShow re-checks the settled frame. A height
    // change (emoji keyboard, suggestions bar) sends willShow again. keyboardWillChangeFrame is
    // left out on purpose: it reports floating iPad keyboards and zero frames. Android only has
    // did events (and none for a height change while open).
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', onShow),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', onHide),
      ...(ios ? [Keyboard.addListener('keyboardDidShow', onShow)] : []),
    ];
    // Already open when the screen appears: take it into account (after this render).
    const seed = setTimeout(() => {
      if (Keyboard.isVisible()) void applyKeyboard(Keyboard.metrics());
    }, 0);
    return () => {
      clearTimeout(seed);
      subs.forEach((s) => s.remove());
    };
  }, [applyKeyboard]);

  const scroll: ComposerScroll = {
    frameHeight,
    keyboardSpace,
    onLayout: (e) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h === frame.current) return;
      frame.current = h;
      setFrameHeight(h);
      // Rotation / resize while the keyboard is up: re-measure what it covers.
      if (space.current > 0 && Keyboard.isVisible()) void applyKeyboard(Keyboard.metrics());
    },
    onScroll: (e) => {
      scrollY.current = e.nativeEvent.contentOffset.y;
    },
    onScrollBeginDrag: () => {
      dragging.current = true;
    },
    onScrollEndDrag: () => {
      dragging.current = false;
    },
    // Android also sends momentum events for our own animated scrolls: those aren't the user's.
    onMomentumScrollBegin: () => {
      if (Date.now() >= autoScrollUntil.current) coasting.current = true;
    },
    onMomentumScrollEnd: () => {
      coasting.current = false;
      dragging.current = false;
    },
    // The content got shorter (keyboard closed): don't leave the screen scrolled past its end.
    onContentSizeChange: (_w, h) => {
      const max = Math.max(0, Math.round(h - frame.current));
      if (frame.current > 0 && scrollY.current > max + 1) scrollTo(max);
    },
    // The room for the keyboard is laid out: center the box once per keyboard opening, after that
    // (keyboard height changed) just keep it in view.
    onKeyboardSpaceLayout: (e) => {
      if (e.nativeEvent.layout.height <= 0 || !isFocused()) return;
      void showBox(centered.current ? 'follow' : 'center');
    },
  };

  const note: ComposerNote = {
    // The box grew (a new line) or moved: keep it in view while typing.
    onBoxLayout: () => {
      if (isFocused() && centered.current) void showBox('follow');
    },
    onTextChange: () => {
      if (isFocused() && centered.current) void showBox('follow');
    },
    onFocus: () => {
      focused.current = true;
      // Focus can arrive after the keyboard's room is laid out (either order happens).
      if (space.current > 0 && !centered.current) void showBox('center');
    },
    onBlur: () => {
      focused.current = false;
    },
  };

  return { refs: { scrollRef, contentRef }, scroll, note };
}
