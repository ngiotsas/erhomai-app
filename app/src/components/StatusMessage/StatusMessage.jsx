import styles from './StatusMessage.module.css';

export default function StatusMessage({ type, message }) {
  if (!message) return null;
  const isError = type === 'error';
  return (
    <div
      className={`${styles.wrapper} ${type === 'error' ? styles.error : ''}`}
      role={isError ? 'alert' : 'status'}
    >
      <p>{message}</p>
    </div>
  );
}
