export type Role = "ADMIN" | "DENTIST" | "RECEPTION" | "ASSISTANT";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  DENTIST: "Odontólogo",
  RECEPTION: "Recepción",
  ASSISTANT: "Auxiliar",
};

export type TokenResponse = { accessToken: string; expiresAt: string };

export type Me = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  clinicId: string;
  clinicName: string;
};

export type User = { id: string; email: string; fullName: string; role: Role; active: boolean };

export type Site = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  active: boolean;
};
