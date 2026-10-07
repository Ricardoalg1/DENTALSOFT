import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"select">, "children"> & {
  name: string;
  label: string;
  options: Record<string, string>;
  /** Texto de la opción vacía; si se omite, no hay opción vacía. */
  placeholder?: string;
  errors?: string[];
};

/** <select> nativo con el estilo de los inputs: accesible y sin JavaScript extra. */
export function NativeSelect({ name, label, options, placeholder, errors, className, id, ...props }: Props) {
  // id propio cuando hay varios formularios iguales en la página; si no, el name.
  const selectId = id ?? name;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={selectId}>{label}</Label>
      <select
        key={String(props.defaultValue ?? "")}
        id={selectId}
        name={name}
        aria-invalid={errors ? true : undefined}
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30",
          className,
        )}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      {errors && <p className="text-sm text-destructive">{errors[0]}</p>}
    </div>
  );
}
