import React from 'react';
import {
    Pressable,
    StyleSheet,
    View,
    type PressableProps,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from '../themed-text';

type ActionButtonVariant = 'primary' | 'secondary' | 'danger' | 'accent' | 'success' | 'warning';
type ActionButtonSize = 'sm' | 'md';
type ActionButtonAlign = 'center' | 'start';

type ActionButtonProps = Omit<PressableProps, 'style'> & {
  label: string;
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  iconOnly?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  surfaceStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  align?: ActionButtonAlign;
};

export function ActionButton({
  label,
  variant = 'secondary',
  size = 'md',
  leftIcon,
  rightIcon,
  iconOnly = false,
  disabled,
  fullWidth = false,
  style,
  surfaceStyle,
  labelStyle,
  align = 'center',
  ...pressableProps
}: ActionButtonProps) {
  const theme = useTheme();
  const palette = getPalette(variant, theme);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={[styles.pressable, fullWidth && styles.fullWidth, style]}
      {...pressableProps}>
      {({ pressed }) => (
        <View
          style={[
            styles.surface,
            fullWidth && styles.surfaceFullWidth,
            size === 'sm' ? styles.small : styles.medium,
            iconOnly && (size === 'sm' ? styles.iconOnlySmall : styles.iconOnlyMedium),
            iconOnly && styles.iconOnlySurface,
            {
              backgroundColor: palette.backgroundColor,
              borderColor: palette.borderColor,
            },
            surfaceStyle,
            (pressed || disabled) && styles.dimmed,
          ]}>
          <View
            style={[
              styles.content,
              fullWidth && styles.contentFullWidth,
              iconOnly && styles.iconOnlyContent,
              align === 'start' ? styles.contentAlignStart : styles.contentAlignCenter,
            ]}>
            {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
            {!iconOnly ? (
              <ThemedText type="smallBold" style={[styles.label, { color: palette.textColor }, labelStyle]}>
                {label}
              </ThemedText>
            ) : null}
            {rightIcon ? <View style={styles.icon}>{rightIcon}</View> : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

function getPalette(variant: ActionButtonVariant, theme: ReturnType<typeof useTheme>) {
  const isDark = theme.background === '#000000';

  switch (variant) {
    case 'accent':
      return {
        backgroundColor: '#dceafe',
        borderColor: '#5b88d9',
        textColor: '#153c73',
      };
    case 'primary':
      return {
        backgroundColor: theme.text,
        borderColor: theme.text,
        textColor: theme.background,
      };
    case 'success':
      return {
        backgroundColor: '#d9f4df',
        borderColor: '#5d9a6c',
        textColor: '#184b25',
      };
    case 'warning':
      return {
        backgroundColor: '#fff0cc',
        borderColor: '#c88a2e',
        textColor: '#7a4b09',
      };
    case 'danger':
      return {
        backgroundColor: '#ffdede',
        borderColor: '#d97777',
        textColor: '#7f1d1d',
      };
    case 'secondary':
    default:
      return {
        backgroundColor: isDark ? theme.backgroundElement : theme.background,
        borderColor: isDark ? '#6b7280' : '#a8b0bb',
        textColor: theme.text,
      };
  }
}

const styles = StyleSheet.create({
  pressable: {
    alignSelf: 'flex-start',
  },
  surface: {
    minHeight: 46,
    borderRadius: Spacing.three,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  small: {
    minHeight: 38,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  medium: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  iconOnlySmall: {
    width: 34,
    minHeight: 34,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: Spacing.two,
  },
  iconOnlyMedium: {
    width: 40,
    minHeight: 40,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: Spacing.two,
  },
  iconOnlySurface: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  surfaceFullWidth: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  contentFullWidth: {
    width: '100%',
  },
  iconOnlyContent: {
    width: 'auto',
    justifyContent: 'center',
    gap: 0,
  },
  contentAlignCenter: {
    justifyContent: 'center',
  },
  contentAlignStart: {
    justifyContent: 'flex-start',
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flexShrink: 1,
  },
  dimmed: {
    opacity: 0.58,
  },
});