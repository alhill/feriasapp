import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    type TextInputProps,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionButton } from '@/components/ui/action-button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/auth-store';

type LoginFieldProps = TextInputProps & {
  label: string;
  rightElement?: React.ReactNode;
};

function LoginField({ label, style, rightElement, ...props }: LoginFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.fieldGroup}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={styles.inputContainer}>
        <TextInput
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
            rightElement ? styles.inputWithRightElement : null,
            {
              color: theme.text,
              borderColor: theme.backgroundSelected,
              backgroundColor: theme.backgroundSelected,
            },
            style,
          ]}
          {...props}
        />
        {rightElement ? <View style={styles.rightElement}>{rightElement}</View> : null}
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const theme = useTheme();
  const signIn = useAuthStore((state) => state.signIn);
  const isSigningIn = useAuthStore((state) => state.isSigningIn);
  const authError = useAuthStore((state) => state.authError);
  const clearAuthError = useAuthStore((state) => state.clearAuthError);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const handleSignIn = React.useCallback(async () => {
    const normalizedUsername = username.trim();

    if (!normalizedUsername || !password) {
      setFormError('Completa usuario y contraseña.');
      clearAuthError();
      return;
    }

    setFormError(null);
    await signIn(normalizedUsername, password);
  }, [clearAuthError, password, signIn, username]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.formWrapper}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.heading}>
              <ThemedText type="title" style={[styles.centerText, styles.headingTitle]}>
                Iniciar sesión en Feriantes
              </ThemedText>
            </View>

            <LoginField
              label="Usuario"
              placeholder="correo@dominio.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              value={username}
              onChangeText={(value) => {
                setUsername(value);
                if (formError) {
                  setFormError(null);
                }
                if (authError) {
                  clearAuthError();
                }
              }}
            />

            <LoginField
              label="Contraseña"
              placeholder="Tu contraseña"
              secureTextEntry={!isPasswordVisible}
              textContentType="password"
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                if (formError) {
                  setFormError(null);
                }
                if (authError) {
                  clearAuthError();
                }
              }}
              onSubmitEditing={handleSignIn}
              rightElement={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isPasswordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onPress={() => setIsPasswordVisible((current) => !current)}
                  hitSlop={Spacing.two}>
                  <MaterialIcons
                    name={isPasswordVisible ? 'visibility-off' : 'visibility'}
                    size={20}
                    color={theme.textSecondary}
                  />
                </Pressable>
              }
            />

            {formError ? <ThemedText style={styles.errorText}>{formError}</ThemedText> : null}
            {authError ? <ThemedText style={styles.errorText}>{authError}</ThemedText> : null}

            <ActionButton
              label={isSigningIn ? 'Entrando...' : 'Entrar'}
              variant="primary"
              onPress={handleSignIn}
              disabled={isSigningIn}
              fullWidth
              style={styles.button}
            />
          </ThemedView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
  },
  formWrapper: {
    width: '100%',
  },
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  heading: {
    gap: Spacing.one,
  },
  centerText: {
    textAlign: 'center',
  },
  fieldGroup: {
    gap: Spacing.two,
  },
  inputContainer: {
    position: 'relative',
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  inputWithRightElement: {
    paddingRight: Spacing.five,
  },
  rightElement: {
    position: 'absolute',
    right: Spacing.three,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  headingTitle: {
    fontSize: 26,
  },
  errorText: {
    color: '#DC2626',
    textAlign: 'center',
  },
  button: {
    marginTop: Spacing.one,
  },
});