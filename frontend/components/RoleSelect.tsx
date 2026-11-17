import type { Role } from "@/lib/types";

const roles: { value: Role; label: string }[] = [
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "ai_ml", label: "AI / ML" },
  { value: "security", label: "Security" },
  { value: "devops", label: "DevOps" },
];

type RoleSelectProps = {
  id: string;
  value: Role;
  onChange: (role: Role) => void;
};

export function RoleSelect({ id, value, onChange }: RoleSelectProps) {
  return (
    <select
      className="form-control"
      id={id}
      onChange={(event) => onChange(event.target.value as Role)}
      value={value}
    >
      {roles.map((role) => (
        <option key={role.value} value={role.value}>{role.label}</option>
      ))}
    </select>
  );
}
