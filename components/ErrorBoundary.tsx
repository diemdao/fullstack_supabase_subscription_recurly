import { posthog } from '@/lib/posthog'
import { ErrorBoundaryProps } from 'expo-router'
import { useEffect } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    posthog.captureException(error)
  }, [error])

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{error.message}</Text>
      <TouchableOpacity style={styles.button} onPress={retry}>
        <Text style={styles.buttonText}>Try again</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  message: { fontSize: 14, color: '#666', marginBottom: 24, textAlign: 'center' },
  button: { backgroundColor: '#0070f3', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
})
