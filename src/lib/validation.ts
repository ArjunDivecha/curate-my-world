export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export const validateUsername = (username: string): ValidationResult => {
  const errors: string[] = [];
  
  // Check length
  if (username.length < 3) {
    errors.push("Username must be at least 3 characters long");
  }
  
  if (username.length > 30) {
    errors.push("Username must be no more than 30 characters long");
  }
  
  // Check if it starts with letter or number
  if (username.length > 0 && !/^[a-zA-Z0-9]/.test(username)) {
    errors.push("Username must start with a letter or number");
  }
  
  // Check for valid characters only (alphanumeric and underscore)
  if (!/^[a-zA-Z0-9_]*$/.test(username)) {
    errors.push("Username can only contain letters, numbers, and underscores");
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateEmail = (email: string): ValidationResult => {
  const errors: string[] = [];
  
  if (!email) {
    errors.push("Email is required");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Please enter a valid email address");
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validatePassword = (password: string): ValidationResult => {
  const errors: string[] = [];
  
  if (password.length < 6) {
    errors.push("Password must be at least 6 characters long");
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};