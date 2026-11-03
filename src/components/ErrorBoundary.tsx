import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import { logger } from '@lib';
import { colors } from '@theme';
import { Text } from './Typography';
import { Button } from './Button';

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary (build prompt §10). Logs via the structured logger,
 * which forwards to Sentry when configured, and shows a warm recovery screen.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string }) {
    logger.error('Unhandled UI error', {
      error: error.message,
      componentStack: info.componentStack ?? '',
    });
  }

  reset = () => this.setState({ error: null });

  override render() {
    if (this.state.error) {
      return (
        <View
          className="flex-1 items-center justify-center gap-3 px-6"
          style={{ backgroundColor: colors.background }}
        >
          <Text style={{ fontSize: 40 }}>😔</Text>
          <Text variant="h2" className="text-center">
            Something went wrong
          </Text>
          <Text variant="bodyMuted" className="text-center">
            We’ve noted it. Please try again.
          </Text>
          <Button
            title="Try again"
            onPress={this.reset}
            fullWidth={false}
            className="mt-2 px-8"
          />
        </View>
      );
    }
    return this.props.children;
  }
}
