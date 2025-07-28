import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ValidationResult } from '@/lib/validation';
import { CheckCircle, XCircle } from 'lucide-react';

interface ValidatedInputProps {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  validator: (value: string) => ValidationResult;
  required?: boolean;
  showValidation?: boolean;
  disabled?: boolean;
}

export const ValidatedInput: React.FC<ValidatedInputProps> = ({
  id,
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  validator,
  required = false,
  showValidation = true,
  disabled = false
}) => {
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true, errors: [] });
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (value || touched) {
      setValidation(validator(value));
    }
  }, [value, validator, touched]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    if (!touched) {
      setTouched(true);
    }
  };

  const handleBlur = () => {
    setTouched(true);
  };

  const showErrors = showValidation && touched && !validation.isValid;
  const showSuccess = showValidation && touched && validation.isValid && value.length > 0;

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          required={required}
          disabled={disabled}
          className={`
            ${showErrors ? 'border-red-500 focus:border-red-500' : ''}
            ${showSuccess ? 'border-green-500 focus:border-green-500' : ''}
            ${showValidation && touched ? 'pr-10' : ''}
          `}
        />
        {showValidation && touched && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            {validation.isValid && value.length > 0 ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : !validation.isValid ? (
              <XCircle className="h-4 w-4 text-red-500" />
            ) : null}
          </div>
        )}
      </div>
      {showErrors && (
        <div className="space-y-1">
          {validation.errors.map((error, index) => (
            <p key={index} className="text-sm text-red-500">
              {error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};