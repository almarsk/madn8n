import { type Param } from '../modules'
import { parseType } from './nodeUtils'

/**
 * Centralized helper to determine if a parameter is obligatory.
 * Defaults to true if not specified (backwards compatibility).
 * 
 * @param param - The parameter to check
 * @returns true if the parameter is obligatory, false otherwise
 */
export const isParamObligatory = (param: Param): boolean => {
  // Default to obligatory if not specified (backwards compatibility)
  return param.obligatory !== false
}

/**
 * Centralized helper to get default value for a parameter type.
 * Handles all type variations including nested types (e.g., list[string]).
 * 
 * @param typeStr - The type string (e.g., "str", "number", "list[str]", "dict")
 * @returns The default value for the type
 */
export const getDefaultValueForType = (typeStr: string | undefined): any => {
  const { base, inner } = parseType(typeStr)
  
  // Handle base types
  if (base === 'number' || base === 'int' || base === 'float') return 0
  if (base === 'boolean' || base === 'bool') return false
  if (base === 'list') return []
  if (base === 'dict') return {}
  
  // For nested types (e.g., list[string]), check inner type
  // This handles cases like list[number] or list[boolean]
  if (inner === 'number' || inner === 'int' || inner === 'float') return 0
  if (inner === 'boolean' || inner === 'bool') return false
  
  // Default to empty string for other types
  return ''
}

/**
 * Centralized helper to check if a value is empty.
 * Checks for null, undefined, empty string, empty array, and empty object.
 * 
 * @param value - The value to check
 * @returns true if the value is considered empty, false otherwise
 */
export const isEmpty = (value: any): boolean => {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return true
  return false
}
