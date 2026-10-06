import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  errors?: string[];
};

export function FormField({ name, label, errors, ...inputProps }: Props) {
  const errorId = `${name}-error`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      {/* key: si el valor por defecto cambia (p. ej. tras un error), se remonta el input con el nuevo valor. */}
      <Input
        key={String(inputProps.defaultValue ?? "")}
        id={name}
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
