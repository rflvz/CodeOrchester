import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ChatMessage {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  agentId?: string;
  agentName?: string;
  status?: 'sending' | 'sent' | 'error';
}

interface ChatStore {
  conversations: Record<string, ChatMessage[]>;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  addMessages: (conversationId: string, messages: ChatMessage[]) => void;
  updateMessage: (conversationId: string, messageId: string, content: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  /** Only initialises the conversation if it doesn't already exist. */
  initConversation: (conversationId: string, initialMessages: ChatMessage[]) => void;
  clearConversation: (conversationId: string) => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      conversations: {},

      addMessage: (conversationId, message) =>
        set((state) => ({
          conversations: {
            ...state.conversations,
            [conversationId]: [...(state.conversations[conversationId] ?? []), message],
          },
        })),

      addMessages: (conversationId, messages) =>
        set((state) => ({
          conversations: {
            ...state.conversations,
            [conversationId]: [...(state.conversations[conversationId] ?? []), ...messages],
          },
        })),

      updateMessage: (conversationId, messageId, content) =>
        set((state) => ({
          conversations: {
            ...state.conversations,
            [conversationId]: (state.conversations[conversationId] ?? []).map((m) =>
              m.id === messageId ? { ...m, content } : m
            ),
          },
        })),

      deleteMessage: (conversationId, messageId) =>
        set((state) => ({
          conversations: {
            ...state.conversations,
            [conversationId]: (state.conversations[conversationId] ?? []).filter(
              (m) => m.id !== messageId
            ),
          },
        })),

      initConversation: (conversationId, initialMessages) =>
        set((state) => {
          if (state.conversations[conversationId]) return state;
          return {
            conversations: { ...state.conversations, [conversationId]: initialMessages },
          };
        }),

      clearConversation: (conversationId) =>
        set((state) => {
          const { [conversationId]: _, ...rest } = state.conversations;
          return { conversations: rest };
        }),
    }),
    {
      name: 'chat-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ conversations: state.conversations }),
    }
  )
);
