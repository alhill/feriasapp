import React from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Text, TextInput, View } from 'react-native';

type ControlledTextInputProps<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  label: string;
  placeholder?: string;
  multiline?: boolean;
};

export function ControlledTextInput<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  multiline = false,
}: ControlledTextInputProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value, onBlur }, fieldState: { error } }) => (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-slate-700">{label}</Text>
          <TextInput
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
            placeholder={placeholder}
            onBlur={onBlur}
            onChangeText={onChange}
            value={String(value ?? '')}
            multiline={multiline}
            textAlignVertical={multiline ? 'top' : 'center'}
          />
          {error ? <Text className="text-xs text-red-600">{error.message}</Text> : null}
        </View>
      )}
    />
  );
}
