"use client";
import { createContext, useContext } from "react";

export const InboxContext = createContext<{ reload(): void }>({ reload() {} });
/** Lets the open conversation tell the list to reload after something changed (a draft sent, a fan taken over, ...). */
export const useInbox = () => useContext(InboxContext);
