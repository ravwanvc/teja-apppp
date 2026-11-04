import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react-native';
import {Button} from '../src/ui';
import {splitTotal,validPhone} from '../../packages/shared';
jest.mock('expo-router',()=>({Link:'Link'}));
test('10% uses ceil so the two parts exactly equal the total',()=>{expect(splitTotal(1001,3)).toEqual({total:3003,deposit:301,balance:2702});expect(validPhone('+998901234567')).toBe(true);expect(validPhone('+998123')).toBe(false)});
test('disabled checkout cannot fire a payment request',async()=>{const pay=jest.fn();await render(<Button title="To‘lash" onPress={pay} disabled/>);await fireEvent.press(screen.getByText('To‘lash'));expect(pay).not.toHaveBeenCalled()});
