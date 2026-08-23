import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Toast } from "../components/Toast";

const ToastContext = createContext();

export const ToastProvider = ({ children }) => {
  const [toast, setToast] = useState({
    visible: false,
    type: "success",
    title: "",
    message: "",
  });

  const showToast = useCallback((type, title, message = "") => {
    setToast({
      visible: true,
      type,
      title: title || "",
      message: message || "",
    });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  // Convenience methods
  const success = useCallback(
    (title, message) => showToast("success", title, message),
    [showToast],
  );

  const error = useCallback(
    (title, message) => showToast("error", title, message),
    [showToast],
  );

  const warning = useCallback(
    (title, message) => showToast("warning", title, message),
    [showToast],
  );

  const info = useCallback(
    (title, message) => showToast("info", title, message),
    [showToast],
  );

  const value = useMemo(
    () => ({ showToast, hideToast, success, error, warning, info }),
    [showToast, hideToast, success, error, warning, info],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast
        visible={toast.visible}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onDismiss={hideToast}
      />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};
