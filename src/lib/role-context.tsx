"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { people, roles, getPersonRole } from "./store";
import type { Person, Role } from "./types";

interface RoleContextValue {
  person: Person;
  role: Role;
  setPersonId: (id: string) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [personId, setPersonId] = useState(people[0].id);
  const person = people.find((p) => p.id === personId)!;
  const role = getPersonRole(person);

  return (
    <RoleContext.Provider value={{ person, role, setPersonId }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useCurrentUser() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useCurrentUser must be used within RoleProvider");
  return ctx;
}

export { people, roles };
