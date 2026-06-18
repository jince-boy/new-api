/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Layout, Modal, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import {
  Image as ImageIcon,
  Images,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';

import { UserContext } from '../../context/User';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { usePlaygroundState } from '../../hooks/playground/usePlaygroundState';
import { useMessageActions } from '../../hooks/playground/useMessageActions';
import { useApiRequest } from '../../hooks/playground/useApiRequest';
import { useMessageEdit } from '../../hooks/playground/useMessageEdit';
import { useDataLoader } from '../../hooks/playground/useDataLoader';
import {
  API_ENDPOINTS,
  MESSAGE_ROLES,
  normalizeImageSizeInput,
  validateImageSize,
} from '../../constants/playground.constants';
import {
  buildApiPayload,
  buildMessageContent,
  createLoadingAssistantMessage,
  createMessage,
  encodeToBase64,
  getLogo,
  getTextContent,
  getUserIdFromLocalStorage,
  stringToColor,
} from '../../helpers';
import {
  OptimizedMessageActions,
  OptimizedMessageContent,
} from '../../components/playground/OptimizedComponents';
import ChatArea from '../../components/playground/ChatArea';
import ImageStudioPanel from '../../components/playground/ImageStudioPanel';
import {
  createImageAssets,
  loadImageLibrary,
  persistImageLibrary,
} from '../../components/playground/imageLibraryStorage';
import { PlaygroundProvider } from '../../contexts/PlaygroundContext';

const PLAYGROUND_MODES = {
  CHAT: 'chat',
  IMAGE: 'image',
  IMAGE_EDIT: 'image_edit',
};

const CONVERSATIONS_STORAGE_KEY = 'playground_conversations';
const MAX_CONVERSATIONS = 40;

const modeMeta = {
  [PLAYGROUND_MODES.CHAT]: {
    label: 'Chat',
    description: 'Ask, analyze, and write in a natural conversation.',
    icon: MessageSquare,
  },
  [PLAYGROUND_MODES.IMAGE]: {
    label: 'Generate image',
    description: 'Enter a prompt to generate images.',
    icon: ImageIcon,
  },
  [PLAYGROUND_MODES.IMAGE_EDIT]: {
    label: 'Image to image',
    description: 'Upload references to edit or redraw images.',
    icon: Images,
  },
};

const generateAvatarDataUrl = (username) => {
  if (!username) {
    return 'https://lf3-static.bytednsdoc.com/obj/eden-cn/ptlz_zlp/ljhwZthlaukjlkulzlp/docs-icon.png';
  }
  const firstLetter = username[0].toUpperCase();
  const bgColor = stringToColor(username);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="16" fill="${bgColor}" />
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="16" fill="#ffffff" font-family="sans-serif">${firstLetter}</text>
    </svg>
  `;
  return `data:image/svg+xml;base64,${encodeToBase64(svg)}`;
};

const loadConversations = () => {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistConversations = (conversations) => {
  const next = conversations.slice(0, MAX_CONVERSATIONS);
  try {
    localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    const compact = next.slice(0, 10).map((conversation) => ({
      ...conversation,
      messages: (conversation.messages || []).map((message) => {
        if (!Array.isArray(message.content)) return message;

        return {
          ...message,
          content: message.content.filter((item) => {
            const url =
              typeof item?.image_url === 'string'
                ? item.image_url
                : item?.image_url?.url;
            return item?.type !== 'image_url' || !url?.startsWith('data:image');
          }),
        };
      }),
    }));

    try {
      localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(compact));
      return compact;
    } catch {
      localStorage.removeItem(CONVERSATIONS_STORAGE_KEY);
      return [];
    }
  }
};

const getMessagePlainText = (msg) => {
  if (!msg) return '';
  const text = getTextContent(msg);
  return typeof text === 'string' ? text.trim() : '';
};

const getConversationTitle = (messages, fallback) => {
  const firstUserMessage = (messages || []).find(
    (msg) => msg.role === MESSAGE_ROLES.USER && getMessagePlainText(msg),
  );
  const text = getMessagePlainText(firstUserMessage);
  if (!text) return fallback;
  return text.length > 28 ? `${text.slice(0, 28)}...` : text;
};

const getConversationPreview = (messages) => {
  const lastMessage = [...(messages || [])]
    .reverse()
    .find((msg) => getMessagePlainText(msg));
  const text = getMessagePlainText(lastMessage);
  if (!text) return '';
  return text.length > 44 ? `${text.slice(0, 44)}...` : text;
};

const createConversation = (messages = [], mode = PLAYGROUND_MODES.CHAT) => {
  const now = Date.now();
  return {
    id: `pg-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: getConversationTitle(messages, 'New chat'),
    preview: getConversationPreview(messages),
    mode,
    messages,
    updatedAt: now,
  };
};

const extractGeneratedImages = (data) => {
  const items = Array.isArray(data?.data) ? data.data : [];
  return items
    .map((item) => {
      if (item?.url) return item.url;
      if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
      return '';
    })
    .filter(Boolean);
};

const extractImageAssetsFromMessages = (messages) => {
  const assets = [];

  (messages || []).forEach((msg) => {
    if (msg.role !== MESSAGE_ROLES.ASSISTANT) return;
    if (!Array.isArray(msg.content)) return;
    const prompt = getMessagePlainText(msg) || 'Creative result';

    msg.content
      .filter((item) => item?.type === 'image_url' && item?.image_url?.url)
      .forEach((item, index) => {
        assets.push({
          id: `${msg.id || msg.createAt || 'message'}-${index}`,
          url: item.image_url.url,
          prompt,
          createdAt: msg.createAt || Date.now(),
        });
      });
  });

  return assets.reverse();
};

const Playground = () => {
  const { t } = useTranslation();
  const [userState] = useContext(UserContext);
  const isMobile = useIsMobile();
  const styleState = { isMobile };
  const [searchParams] = useSearchParams();
  const [activeMode, setActiveMode] = useState(PLAYGROUND_MODES.CHAT);
  const [conversations, setConversations] = useState(loadConversations);
  const [activeConversationId, setActiveConversationId] = useState(
    () => loadConversations()[0]?.id || '',
  );
  const [imageLibrary, setImageLibrary] = useState(loadImageLibrary);
  const hasHydratedConversation = useRef(false);
  const skipNextConversationPersist = useRef(false);
  const messageRef = useRef([]);
  const activeConversationIdRef = useRef(activeConversationId);
  const activeModeRef = useRef(activeMode);

  const state = usePlaygroundState();
  const {
    inputs,
    parameterEnabled,
    models,
    groups,
    message,
    sseSourceRef,
    chatRef,
    handleInputChange,
    debouncedSaveConfig,
    saveMessagesImmediately,
    setModels,
    setGroups,
    setMessage,
    setDebugData,
    setActiveDebugTab,
  } = state;

  messageRef.current = message;
  activeConversationIdRef.current = activeConversationId;
  activeModeRef.current = activeMode;

  const syncActiveConversation = useCallback(
    (nextMessages, options = {}) => {
      const conversationId =
        options.conversationId ?? activeConversationIdRef.current;
      if (!conversationId) return;

      const mode = activeModeRef.current;
      const promote = options.promote ?? true;

      const syncConversations = (prev) => {
        const existingIndex = prev.findIndex(
          (conversation) => conversation.id === conversationId,
        );
        const nextMode =
          conversationId === activeConversationIdRef.current
            ? activeModeRef.current
            : prev[existingIndex]?.mode || mode;
        const updatedConversation = {
          ...(existingIndex >= 0 ? prev[existingIndex] : createConversation()),
          id: conversationId,
          title: getConversationTitle(nextMessages, t('New chat')),
          preview: getConversationPreview(nextMessages),
          mode: nextMode,
          messages: nextMessages,
          updatedAt: Date.now(),
        };

        if (existingIndex < 0) {
          return [updatedConversation, ...prev];
        }

        const next = [...prev];
        next[existingIndex] = updatedConversation;
        if (!promote) {
          return next;
        }

        return [
          updatedConversation,
          ...next.slice(0, existingIndex),
          ...next.slice(existingIndex + 1),
        ];
      };

      const persisted = persistConversations(
        syncConversations(loadConversations()),
      );
      setConversations(persisted);
    },
    [t],
  );

  const updateActiveMessages = useCallback(
    (updater, options = {}) => {
      const targetConversationId =
        options.conversationId ?? activeConversationIdRef.current;
      const isActiveConversation =
        !targetConversationId ||
        targetConversationId === activeConversationIdRef.current;
      const baseMessages =
        isActiveConversation
          ? messageRef.current
          : loadConversations().find(
              (conversation) => conversation.id === targetConversationId,
            )?.messages || [];
      const nextMessages =
        typeof updater === 'function' ? updater(baseMessages) : updater;
      if (isActiveConversation) {
        messageRef.current = nextMessages;
        saveMessagesImmediately(nextMessages);
        setMessage(nextMessages);
      }
      syncActiveConversation(nextMessages, {
        ...options,
        conversationId: targetConversationId,
      });
    },
    [saveMessagesImmediately, setMessage, syncActiveConversation],
  );

  const saveMessagesForConversation = useCallback(
    (nextMessages, options = {}) => {
      const targetConversationId =
        options.conversationId ?? activeConversationIdRef.current;
      if (
        !targetConversationId ||
        targetConversationId === activeConversationIdRef.current
      ) {
        saveMessagesImmediately(nextMessages);
      }
    },
    [saveMessagesImmediately],
  );

  const { sendRequest, onStopGenerator } = useApiRequest(
    updateActiveMessages,
    setDebugData,
    setActiveDebugTab,
    sseSourceRef,
    saveMessagesForConversation,
  );

  useDataLoader(userState, inputs, handleInputChange, setModels, setGroups);

  const {
    editingMessageId,
    editValue,
    setEditValue,
    handleMessageEdit,
    handleEditSave,
    handleEditCancel,
  } = useMessageEdit(
    updateActiveMessages,
    inputs,
    parameterEnabled,
    sendRequest,
    saveMessagesImmediately,
  );

  const roleInfo = {
    user: {
      name: userState?.user?.username || 'User',
      avatar: generateAvatarDataUrl(userState?.user?.username),
    },
    assistant: {
      name: 'Assistant',
      avatar: getLogo(),
    },
    system: {
      name: 'System',
      avatar: getLogo(),
    },
  };

  const messageActions = useMessageActions(
    message,
    updateActiveMessages,
    onMessageSend,
    saveMessagesImmediately,
  );

  const isGenerating = message.some(
    (msg) => msg.status === 'loading' || msg.status === 'incomplete',
  );
  const validImageUrls = useMemo(
    () => (inputs.imageUrls || []).filter((url) => url?.trim()),
    [inputs.imageUrls],
  );
  const currentImageAssets = useMemo(
    () => extractImageAssetsFromMessages(message).slice(0, 6),
    [message],
  );

  useEffect(() => {
    if (hasHydratedConversation.current) return;
    hasHydratedConversation.current = true;

    if (conversations.length > 0 && activeConversationId) {
      const current = conversations.find(
        (conversation) => conversation.id === activeConversationId,
      );
      if (current) {
        skipNextConversationPersist.current = true;
        messageRef.current = current.messages || [];
        activeModeRef.current = current.mode || PLAYGROUND_MODES.CHAT;
        setMessage(current.messages || []);
        setActiveMode(current.mode || PLAYGROUND_MODES.CHAT);
      }
      return;
    }

    if (message.length === 0) return;

    const initialConversation = createConversation(message, activeMode);
    setActiveConversationId(initialConversation.id);
    setConversations((prev) =>
      persistConversations([initialConversation, ...prev]),
    );
  }, [activeConversationId, activeMode, conversations, message, setMessage]);

  useEffect(() => {
    if (!activeConversationId || !hasHydratedConversation.current) return;
    if (skipNextConversationPersist.current) {
      skipNextConversationPersist.current = false;
      return;
    }

    setConversations((prev) => {
      const existingIndex = prev.findIndex(
        (conversation) => conversation.id === activeConversationId,
      );
      const updatedConversation = {
        ...(existingIndex >= 0 ? prev[existingIndex] : createConversation()),
        id: activeConversationId,
        title: getConversationTitle(message, t('New chat')),
        preview: getConversationPreview(message),
        mode: activeMode,
        messages: message,
        updatedAt: Date.now(),
      };

      if (existingIndex < 0) {
        return persistConversations([updatedConversation, ...prev]);
      }

      const next = [...prev];
      next[existingIndex] = updatedConversation;
      return persistConversations(next);
    });
  }, [activeConversationId, activeMode, message, t]);

  useEffect(() => {
    if (searchParams.get('expired')) {
      Toast.warning(t('Session expired!'));
    }
  }, [searchParams, t]);

  useEffect(() => {
    debouncedSaveConfig();
  }, [inputs, parameterEnabled, debouncedSaveConfig]);

  const replaceLoadingMessage = useCallback(
    (loadingId, nextMessage, conversationId) => {
      updateActiveMessages((prevMessage) => {
        const updatedMessages = prevMessage.map((msg) =>
          msg.id === loadingId ? nextMessage : msg,
        );
        return updatedMessages;
      }, { conversationId });
    },
    [updateActiveMessages],
  );

  const handleModeChange = useCallback(
    (mode) => {
      setActiveMode(mode);
      if (mode === PLAYGROUND_MODES.IMAGE_EDIT) {
        handleInputChange('imageEnabled', true);
      }
    },
    [handleInputChange],
  );

  const ensureConversation = useCallback(
    (mode, nextMessages = []) => {
      if (activeConversationId) return activeConversationId;

      const nextConversation = createConversation(nextMessages, mode);
      activeConversationIdRef.current = nextConversation.id;
      activeModeRef.current = mode;
      setActiveConversationId(nextConversation.id);
      setConversations((prev) =>
        persistConversations([nextConversation, ...prev]),
      );
      return nextConversation.id;
    },
    [activeConversationId],
  );

  const sendImageRequest = useCallback(
    async (content) => {
      const prompt = typeof content === 'string' ? content.trim() : '';
      const requestMode =
        validImageUrls.length > 0
          ? PLAYGROUND_MODES.IMAGE_EDIT
          : activeMode === PLAYGROUND_MODES.IMAGE_EDIT
            ? PLAYGROUND_MODES.IMAGE_EDIT
            : PLAYGROUND_MODES.IMAGE;
      if (!prompt) {
        Toast.warning(t('Please enter a prompt first'));
        return;
      }
      if (
        requestMode === PLAYGROUND_MODES.IMAGE_EDIT &&
        validImageUrls.length === 0
      ) {
        Toast.warning(t('Please upload a reference image first'));
        return;
      }

      const userMessage = createMessage(
        MESSAGE_ROLES.USER,
        buildMessageContent(
          prompt,
          validImageUrls,
          requestMode === PLAYGROUND_MODES.IMAGE_EDIT,
        ),
      );
      const loadingMessage = createLoadingAssistantMessage();
      const endpoint =
        requestMode === PLAYGROUND_MODES.IMAGE_EDIT
          ? API_ENDPOINTS.IMAGE_EDITS
          : API_ENDPOINTS.IMAGE_GENERATIONS;
      const requestedImageSize = normalizeImageSizeInput(inputs.imageSize);
      const sizeValidation = validateImageSize(requestedImageSize);
      if (!sizeValidation.valid) {
        Toast.warning(
          `${t('Image size')}: ${t(sizeValidation.reason || 'Invalid image size.')}`,
        );
        return;
      }
      const payload = {
        model: inputs.model,
        group: inputs.group,
        prompt,
        n: Math.max(1, Math.min(Number(inputs.imageCount) || 1, 10)),
        size: sizeValidation.normalized,
        quality: inputs.imageQuality || 'auto',
        response_format: 'url',
      };

      if (requestMode === PLAYGROUND_MODES.IMAGE_EDIT) {
        payload.image = validImageUrls[0];
        payload.images = validImageUrls;
      }

      const nextMessages = [...message, userMessage, loadingMessage];
      const conversationId = ensureConversation(requestMode, nextMessages);

      updateActiveMessages((prevMessage) => {
        const nextMessages = [...prevMessage, userMessage, loadingMessage];
        return nextMessages;
      }, { conversationId });
      setDebugData((prev) => ({
        ...prev,
        request: payload,
        timestamp: new Date().toISOString(),
        response: null,
        sseMessages: null,
        isStreaming: false,
      }));
      setActiveDebugTab('request');

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'New-Api-User': getUserIdFromLocalStorage(),
          },
          body: JSON.stringify(payload),
        });

        const rawText = await response.text();
        const data = rawText ? JSON.parse(rawText) : {};

        setDebugData((prev) => ({
          ...prev,
          response: JSON.stringify(data, null, 2),
        }));
        setActiveDebugTab('response');

        if (!response.ok) {
          throw new Error(
            data?.error?.message || rawText || t('Image generation failed'),
          );
        }

        const generatedImages = extractGeneratedImages(data);
        if (generatedImages.length === 0) {
          throw new Error(t('No images returned'));
        }

        const generatedAssets = createImageAssets({
          urls: generatedImages,
          prompt,
          mode: requestMode,
          model: inputs.model,
          group: inputs.group,
          size: payload.size,
          quality: payload.quality,
          conversationId,
        });
        setImageLibrary((prev) =>
          persistImageLibrary([...generatedAssets, ...prev]),
        );

        const assistantContent = generatedImages.map((url) => ({
          type: 'image_url',
          image_url: { url },
        }));

        replaceLoadingMessage(
          loadingMessage.id,
          createMessage(MESSAGE_ROLES.ASSISTANT, assistantContent, {
            status: 'complete',
            reasoningContent: '',
            isReasoningExpanded: false,
          }),
          conversationId,
        );
      } catch (error) {
        console.error('Image generation failed:', error);
        replaceLoadingMessage(
          loadingMessage.id,
          createMessage(
            MESSAGE_ROLES.ASSISTANT,
            `${t('Image generation failed')}: ${error.message}`,
            {
              status: 'error',
              errorCode: null,
            },
          ),
          conversationId,
        );
      }
    },
    [
      activeMode,
      ensureConversation,
      inputs.group,
      inputs.imageCount,
      inputs.imageQuality,
      inputs.imageSize,
      inputs.model,
      message,
      replaceLoadingMessage,
      setActiveDebugTab,
      setDebugData,
      t,
      updateActiveMessages,
      validImageUrls,
    ],
  );

  function onMessageSend(content) {
    if (
      activeMode === PLAYGROUND_MODES.IMAGE ||
      activeMode === PLAYGROUND_MODES.IMAGE_EDIT ||
      validImageUrls.length > 0
    ) {
      sendImageRequest(content);
      return;
    }

    const loadingMessage = createLoadingAssistantMessage();
    const messageContent = buildMessageContent(
      content,
      validImageUrls,
      inputs.imageEnabled,
    );
    const userMessageWithImages = createMessage(
      MESSAGE_ROLES.USER,
      messageContent,
    );

    const newMessages = [...messageRef.current, userMessageWithImages];
    const messagesWithLoading = [...newMessages, loadingMessage];
    const conversationId = ensureConversation(activeMode, messagesWithLoading);
    const payload = buildApiPayload(newMessages, null, inputs, parameterEnabled);

    updateActiveMessages(messagesWithLoading, { conversationId });
    sendRequest(payload, inputs.stream, { conversationId });

    if (inputs.imageEnabled) {
      setTimeout(() => {
        handleInputChange('imageEnabled', false);
      }, 100);
    }
  }

  const toggleReasoningExpansion = useCallback(
    (messageId) => {
      updateActiveMessages(
        (prevMessages) =>
          prevMessages.map((msg) =>
            msg.id === messageId && msg.role === MESSAGE_ROLES.ASSISTANT
              ? { ...msg, isReasoningExpanded: !msg.isReasoningExpanded }
              : msg,
          ),
        { promote: false },
      );
    },
    [updateActiveMessages],
  );

  const renderCustomChatContent = useCallback(
    ({ message, className }) => {
      const isCurrentlyEditing = editingMessageId === message.id;

      return (
        <OptimizedMessageContent
          message={message}
          className={className}
          styleState={styleState}
          onToggleReasoningExpansion={toggleReasoningExpansion}
          isEditing={isCurrentlyEditing}
          onEditSave={handleEditSave}
          onEditCancel={handleEditCancel}
          editValue={editValue}
          onEditValueChange={setEditValue}
        />
      );
    },
    [
      styleState,
      editingMessageId,
      editValue,
      handleEditSave,
      handleEditCancel,
      setEditValue,
      toggleReasoningExpansion,
    ],
  );

  const renderChatBoxAction = useCallback(
    (props) => {
      const { message: currentMessage } = props;
      const isCurrentlyEditing = editingMessageId === currentMessage.id;

      return (
        <OptimizedMessageActions
          message={currentMessage}
          styleState={styleState}
          onMessageReset={messageActions.handleMessageReset}
          onMessageCopy={messageActions.handleMessageCopy}
          onMessageDelete={messageActions.handleMessageDelete}
          onRoleToggle={messageActions.handleRoleToggle}
          onMessageEdit={handleMessageEdit}
          isAnyMessageGenerating={isGenerating}
          isEditing={isCurrentlyEditing}
        />
      );
    },
    [
      messageActions,
      styleState,
      editingMessageId,
      handleMessageEdit,
      isGenerating,
    ],
  );

  const handleClearMessages = useCallback(() => {
    updateActiveMessages([], { promote: false });
  }, [updateActiveMessages]);

  const handleClearAllConversations = useCallback(() => {
    messageRef.current = [];
    activeConversationIdRef.current = '';
    activeModeRef.current = PLAYGROUND_MODES.CHAT;
    setConversations(persistConversations([]));
    setActiveConversationId('');
    setActiveMode(PLAYGROUND_MODES.CHAT);
    setMessage([]);
    saveMessagesImmediately([]);
    handleInputChange('imageUrls', ['']);
    handleInputChange('imageEnabled', false);
  }, [handleInputChange, saveMessagesImmediately, setMessage]);

  const handleNewChat = useCallback(() => {
    const nextConversation = createConversation([], PLAYGROUND_MODES.CHAT);
    setConversations((prev) => persistConversations([nextConversation, ...prev]));
    activeConversationIdRef.current = nextConversation.id;
    activeModeRef.current = PLAYGROUND_MODES.CHAT;
    messageRef.current = [];
    setActiveConversationId(nextConversation.id);
    setActiveMode(PLAYGROUND_MODES.CHAT);
    setMessage([]);
    saveMessagesImmediately([]);
    handleInputChange('imageUrls', ['']);
    handleInputChange('imageEnabled', false);
  }, [handleInputChange, saveMessagesImmediately, setMessage]);

  const handleSelectConversation = useCallback(
    (conversation) => {
      skipNextConversationPersist.current = true;
      activeConversationIdRef.current = conversation.id;
      activeModeRef.current = conversation.mode || PLAYGROUND_MODES.CHAT;
      messageRef.current = conversation.messages || [];
      setActiveConversationId(conversation.id);
      setActiveMode(conversation.mode || PLAYGROUND_MODES.CHAT);
      setMessage(conversation.messages || []);
      saveMessagesImmediately(conversation.messages || []);
    },
    [saveMessagesImmediately, setMessage],
  );

  const handleDeleteConversation = useCallback(
    (conversationId) => {
      setConversations((prev) => {
        const next = persistConversations(
          prev.filter((conversation) => conversation.id !== conversationId),
        );
        if (next.length === 0) {
          setActiveConversationId('');
          activeConversationIdRef.current = '';
          activeModeRef.current = PLAYGROUND_MODES.CHAT;
          messageRef.current = [];
          setActiveMode(PLAYGROUND_MODES.CHAT);
          setMessage([]);
          saveMessagesImmediately([]);
          handleInputChange('imageUrls', ['']);
          handleInputChange('imageEnabled', false);
          return next;
        }
        if (conversationId === activeConversationId) {
          const fallback = next[0];
          skipNextConversationPersist.current = true;
          activeConversationIdRef.current = fallback.id;
          activeModeRef.current = fallback.mode || PLAYGROUND_MODES.CHAT;
          messageRef.current = fallback.messages || [];
          setActiveConversationId(fallback.id);
          setActiveMode(fallback.mode || PLAYGROUND_MODES.CHAT);
          setMessage(fallback.messages || []);
          saveMessagesImmediately(fallback.messages || []);
        }
        return next;
      });
    },
    [activeConversationId, handleInputChange, saveMessagesImmediately, setMessage],
  );

  const handlePasteImage = useCallback(
    (base64Data) => {
      const currentUrls = (inputs.imageUrls || []).filter((url) => url?.trim());
      handleInputChange('imageUrls', [...currentUrls, base64Data]);
      handleInputChange('imageEnabled', true);
      setActiveMode(PLAYGROUND_MODES.IMAGE_EDIT);
    },
    [inputs.imageUrls, handleInputChange],
  );

  const handleAddReferences = useCallback(
    (urls) => {
      const currentUrls = (inputs.imageUrls || []).filter((url) => url?.trim());
      const nextUrls = [...currentUrls, ...(urls || [])].filter(Boolean);
      handleInputChange('imageUrls', nextUrls);
      handleInputChange('imageEnabled', nextUrls.length > 0);
      if (nextUrls.length > 0) {
        setActiveMode(PLAYGROUND_MODES.IMAGE_EDIT);
      }
    },
    [handleInputChange, inputs.imageUrls],
  );

  const handleRemoveReference = useCallback(
    (index) => {
      const nextUrls = validImageUrls.filter((_, itemIndex) => itemIndex !== index);
      handleInputChange('imageUrls', nextUrls.length > 0 ? nextUrls : ['']);
      handleInputChange('imageEnabled', nextUrls.length > 0);
    },
    [handleInputChange, validImageUrls],
  );

  const handleClearReferences = useCallback(() => {
    handleInputChange('imageUrls', ['']);
    handleInputChange('imageEnabled', false);
  }, [handleInputChange]);

  const handleUseImageAsReference = useCallback(
    (url) => {
      const currentUrls = (inputs.imageUrls || []).filter((item) => item?.trim());
      const nextUrls = currentUrls.includes(url) ? currentUrls : [url, ...currentUrls];
      handleInputChange('imageUrls', nextUrls);
      handleInputChange('imageEnabled', true);
      setActiveMode(PLAYGROUND_MODES.IMAGE_EDIT);
      Toast.success(t('Added to image-to-image references'));
    },
    [handleInputChange, inputs.imageUrls, t],
  );

  const handleDeleteImageAsset = useCallback((assetId) => {
    setImageLibrary((prev) =>
      persistImageLibrary(prev.filter((asset) => asset.id !== assetId)),
    );
  }, []);

  const handleClearImageLibrary = useCallback(() => {
    Modal.confirm({
      title: t('Clear local image library?'),
      content: t('Generated images saved in this browser will be removed.'),
      onOk: () => setImageLibrary(persistImageLibrary([])),
    });
  }, [t]);

  const playgroundContextValue = {
    onPasteImage: handlePasteImage,
    imageUrls: inputs.imageUrls || [],
    imageEnabled: inputs.imageEnabled || false,
    activeMode,
    modeItems: Object.entries(modeMeta).map(([key, meta]) => ({
      key,
      label: meta.label,
      icon: meta.icon,
    })),
    inputs,
    models,
    groups,
    onModeChange: handleModeChange,
    onInputChange: handleInputChange,
    onImageUrlsChange: (urls) => handleInputChange('imageUrls', urls),
    onImageEnabledChange: (enabled) => handleInputChange('imageEnabled', enabled),
  };

  return (
    <PlaygroundProvider value={playgroundContextValue}>
      <div className='playground-workbench h-full bg-[var(--semi-color-bg-0)]'>
        <Layout className='h-full bg-transparent'>
          <div className='mt-[64px] flex h-[calc(100vh-64px)] min-h-0 w-full bg-[var(--semi-color-bg-0)]'>
            <aside className='playground-history hidden w-[300px] flex-shrink-0 flex-col px-3 py-3 md:flex'>
              <div className='playground-history-head mb-3 flex items-center justify-between'>
                <div className='min-w-0'>
                  <Typography.Title heading={6} className='!mb-0'>
                    {t('Conversation history')}
                  </Typography.Title>
                  <Typography.Text className='text-xs text-[var(--semi-color-text-2)]'>
                    {t('Saved locally')}
                  </Typography.Text>
                </div>
                <Button
                  icon={<MoreHorizontal size={16} />}
                  theme='borderless'
                  type='tertiary'
                  className='!rounded-full'
                />
              </div>
              <Button
                icon={<Plus size={16} />}
                onClick={handleNewChat}
                theme='light'
                type='primary'
                block
                className='playground-new-chat !h-10 !rounded-xl'
              >
                {t('New chat')}
              </Button>

              <div className='model-settings-scroll mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1'>
                {conversations.map((conversation) => {
                  const selected = conversation.id === activeConversationId;
                  const ModeIcon =
                    modeMeta[conversation.mode || PLAYGROUND_MODES.CHAT]?.icon ||
                    MessageSquare;
                  return (
                    <div
                      key={conversation.id}
                      className={`group playground-history-row flex items-center gap-2 rounded-xl px-2.5 py-2.5 transition-all ${
                        selected
                          ? 'playground-history-item-active'
                          : 'playground-history-item'
                      }`}
                    >
                      <button
                        type='button'
                        onClick={() => handleSelectConversation(conversation)}
                        className='flex min-w-0 flex-1 items-start gap-2 text-left'
                      >
                        <ModeIcon
                          size={15}
                          className={`mt-0.5 flex-shrink-0 ${
                            selected
                              ? 'text-[var(--semi-color-primary)]'
                              : 'text-[var(--semi-color-text-2)]'
                          }`}
                        />
                        <span className='min-w-0 flex-1'>
                          <span className='playground-history-title block truncate text-sm font-medium text-[var(--semi-color-text-0)]'>
                            {conversation.title || t('New chat')}
                          </span>
                          <span className='playground-history-preview block truncate text-xs text-[var(--semi-color-text-2)]'>
                            {conversation.preview || t('No messages yet')}
                          </span>
                        </span>
                      </button>
                      <button
                        type='button'
                        className='playground-history-delete flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[var(--semi-color-text-2)] opacity-0 transition-opacity hover:bg-[var(--semi-color-danger-light-default)] hover:text-[var(--semi-color-danger)] group-hover:opacity-100'
                        onClick={() => {
                          Modal.confirm({
                            title: t('Delete conversation'),
                            content: t('Delete this conversation?'),
                            onOk: () => handleDeleteConversation(conversation.id),
                          });
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className='mt-3 border-t border-[var(--semi-color-border)] pt-3'>
                <Button
                  icon={<Trash2 size={14} />}
                  onClick={() => {
                    Modal.confirm({
                      title: t('Clear all Playground conversations?'),
                      content: t('All Playground conversation history will be removed.'),
                      onOk: handleClearAllConversations,
                    });
                  }}
                  theme='borderless'
                  type='danger'
                  size='small'
                  className='!rounded-xl'
                >
                  {t('Clear all conversations')}
                </Button>
              </div>
            </aside>

            <Layout.Content className='flex min-w-0 flex-1 flex-col overflow-hidden'>
              <header className='flex min-h-[56px] flex-shrink-0 items-center gap-3 border-b border-[var(--semi-color-border)] px-3 py-2 sm:px-5 md:hidden'>
                <Button
                  icon={<Plus size={16} />}
                  onClick={handleNewChat}
                  theme='borderless'
                  type='tertiary'
                  className='!rounded-full'
                />
                <div className='min-w-0 flex-1'>
                  <Typography.Title heading={6} className='!mb-0 truncate'>
                    {conversations.find((item) => item.id === activeConversationId)
                      ?.title || t('New chat')}
                  </Typography.Title>
                </div>
                {isGenerating && (
                  <Tag color='blue' size='small'>
                    {t('Generating')}
                  </Tag>
                )}
              </header>

              <div className='playground-content-grid min-h-0 flex-1 overflow-hidden'>
                <div className='min-h-0 min-w-0 overflow-hidden'>
                  <ChatArea
                    chatRef={chatRef}
                    message={message}
                    roleInfo={roleInfo}
                    onMessageSend={onMessageSend}
                    onMessageCopy={messageActions.handleMessageCopy}
                    onMessageReset={messageActions.handleMessageReset}
                    onMessageDelete={messageActions.handleMessageDelete}
                    onStopGenerator={onStopGenerator}
                    onClearMessages={handleClearMessages}
                    renderCustomChatContent={renderCustomChatContent}
                    renderChatBoxAction={renderChatBoxAction}
                  />
                </div>
                <ImageStudioPanel
                  activeMode={activeMode}
                  modeItems={Object.entries(modeMeta).map(([key, meta]) => ({
                    key,
                    label: meta.label,
                    icon: meta.icon,
                  }))}
                  inputs={inputs}
                  models={models}
                  groups={groups}
                  references={validImageUrls}
                  latestImages={currentImageAssets}
                  imageLibrary={imageLibrary}
                  isGenerating={isGenerating}
                  onModeChange={handleModeChange}
                  onInputChange={handleInputChange}
                  onAddReferences={handleAddReferences}
                  onRemoveReference={handleRemoveReference}
                  onClearReferences={handleClearReferences}
                  onUseImageAsReference={handleUseImageAsReference}
                  onDeleteImageAsset={handleDeleteImageAsset}
                  onClearImageLibrary={handleClearImageLibrary}
                />
              </div>
            </Layout.Content>
          </div>
        </Layout>
      </div>
    </PlaygroundProvider>
  );
};

export default Playground;
