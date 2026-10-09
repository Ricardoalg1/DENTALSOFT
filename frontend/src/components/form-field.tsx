import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  errors?: string[];
};

export function FormField({ name, label, errors, id, ...inputProps }: Props) {
  // id propio cuando hay varios formularios con el mismo campo en una página; si no, el name.
  const inputId = id ?? name;
  const errorId = `${inputId}-error`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      {/* key: si el valor por defecto cambia (p. ej. tras un error), se remonta el input con el nuevo valor. */}
      <Input
        key={String(inputProps.defaultValue ?? "")}
        id={inputId}
        name={name}
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? errorId : undefined}
        {...inputProps}
      />
      {errors && (
        <p id={errorId} className="text-sm text-destructive">
          {errors[0]}
        </p>
      )}
    </div>
  );
}
