'use client';

import React, { createContext, useState, useContext, useEffect, ReactNode, Dispatch, SetStateAction } from 'react';

import { ClientPrintTaskData } from '@/types/print-tasks';

type PrintQueueModalContextType = {
  selectedTask: ClientPrintTaskData | null;
  setSelectedTask: Dispatch<SetStateAction<ClientPrintTaskData | null>>;
  isModalOpen: boolean;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
};

const PrintQueueModalContext = createContext<PrintQueueModalContextType | undefined>(undefined);

export const PrintQueueModalProvider = ({ children }: { children: ReactNode }) => {
  const [selectedTask, setSelectedTask] = useState<ClientPrintTaskData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Automatically close modal if selected task is cleared elsewhere
  useEffect(() => {
    if (!selectedTask) {
      setIsModalOpen(false);
    }
  }, [selectedTask]);

  const value = {
    selectedTask,
    setSelectedTask,
    isModalOpen,
    setIsModalOpen,
  };

  return (
    <PrintQueueModalContext.Provider value={value}>
      {children}
    </PrintQueueModalContext.Provider>
  );
};

export const usePrintQueueModal = () => {
  const context = useContext(PrintQueueModalContext);
  if (context === undefined) {
    throw new Error('usePrintQueueModal must be used within a PrintQueueModalProvider');
  }
  return context;
};
